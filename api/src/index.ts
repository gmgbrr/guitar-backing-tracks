import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { UPLOAD_LIMITS, type MetronomeRecord, type SongDetail, type SongSummary, type VideoRecord } from '@backing-tracks/shared';
import { config } from './config.js';
import { gcpClients } from './gcp.js';
import { FirestoreSongRepository } from './repositories/FirestoreSongRepository.js';
import { JsonSongRepository } from './repositories/JsonSongRepository.js';
import type { SongRepository } from './repositories/SongRepository.js';
import {
  asyncHandler,
  errorHandler,
  hostGuard,
  HttpError,
  originGuard,
  readLimiter,
  securityHeaders,
  SONG_ID_RE,
  uploadLimiter,
  writeLimiter,
} from './security.js';
import { GcsMediaStorage } from './storage/GcsMediaStorage.js';
import { LocalMediaStorage } from './storage/LocalMediaStorage.js';
import type { MediaStorage } from './storage/MediaStorage.js';
import { UPLOAD_FILE_FIELDS, validateUpload, type IncomingFiles } from './upload.js';

const songsDir = path.join(config.dataDir, 'songs');

async function createAdapters(): Promise<{ songs: SongRepository; media: MediaStorage }> {
  switch (config.storageDriver) {
    case 'local':
      return { songs: new JsonSongRepository(songsDir), media: new LocalMediaStorage(songsDir) };
    case 'gcp': {
      const { firestore, bucket } = await gcpClients();
      return { songs: new FirestoreSongRepository(firestore), media: new GcsMediaStorage(bucket) };
    }
    default:
      throw new Error(`STORAGE_DRIVER desconhecido: ${config.storageDriver}`);
  }
}

const { songs, media } = await createAdapters();
console.log(`Dados: ${config.storageDriver === 'gcp' ? `GCP (${config.gcp.project})` : config.dataDir}`);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);

// ---------- proteções globais ----------
app.use(hostGuard(config));
app.use(securityHeaders());
app.use(cors({ origin: config.allowedOrigins, methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'] }));
app.use(originGuard(config));
app.use('/api', express.json({ limit: '10kb', strict: true }));

// Todo :id é validado antes de chegar ao banco (sem "/", ".", maiúsculas ou tamanho absurdo).
app.param('id', (req, _res, next, id: string) => {
  next(SONG_ID_RE.test(id) ? undefined : new HttpError(404, 'Música não encontrada'));
});

const notFound = () => new HttpError(404, 'Música não encontrada');

// ---------- leitura ----------
app.get(
  '/api/songs',
  readLimiter,
  asyncHandler(async (_req, res) => {
    const list = await songs.list();
    const summaries: SongSummary[] = await Promise.all(
      list.map(async (s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        key: s.key,
        bpm: s.bpm,
        durationSec: s.durationSec,
        stemNames: s.stems.map((st) => st.name),
        hasLyrics: Boolean(s.lyricsFile),
        hasVideo: Boolean(s.video),
        coverUrl: s.coverFile ? await media.getUrl(s.id, s.coverFile) : undefined,
      })),
    );
    res.json(summaries);
  }),
);

app.get(
  '/api/songs/:id',
  readLimiter,
  asyncHandler(async (req, res) => {
    const song = await songs.get(req.params.id);
    if (!song) throw notFound();
    const { stems, lyricsFile, coverFile, ...rest } = song;
    const detail: SongDetail = {
      ...rest,
      stems: await Promise.all(stems.map(async (st) => ({ name: st.name, url: await media.getUrl(song.id, st.file) }))),
      lyricsUrl: lyricsFile ? await media.getUrl(song.id, lyricsFile) : undefined,
      coverUrl: coverFile ? await media.getUrl(song.id, coverFile) : undefined,
    };
    res.json(detail);
  }),
);

// ---------- alterações ----------
app.put(
  '/api/songs/:id/video',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { youtubeId, offsetSec } = (req.body ?? {}) as Partial<VideoRecord>;
    const valid =
      typeof youtubeId === 'string' && /^[\w-]{11}$/.test(youtubeId) &&
      typeof offsetSec === 'number' && Number.isFinite(offsetSec) && Math.abs(offsetSec) <= 3600;
    if (!valid) throw new HttpError(400, 'Esperado { youtubeId: id de 11 caracteres, offsetSec: número }');
    const video: VideoRecord = { youtubeId, offsetSec: Math.round(offsetSec * 1000) / 1000 };
    if (!(await songs.update(req.params.id, { video }))) throw notFound();
    res.json(video);
  }),
);

app.delete(
  '/api/songs/:id/video',
  writeLimiter,
  asyncHandler(async (req, res) => {
    if (!(await songs.update(req.params.id, { video: undefined }))) throw notFound();
    res.status(204).end();
  }),
);

app.put(
  '/api/songs/:id/metronome',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { bpm, offsetSec, beatsPerBar } = (req.body ?? {}) as Partial<MetronomeRecord>;
    const valid =
      typeof bpm === 'number' && Number.isFinite(bpm) && bpm >= 20 && bpm <= 300 &&
      typeof offsetSec === 'number' && Number.isFinite(offsetSec) && offsetSec >= 0 && offsetSec < 60 &&
      Number.isInteger(beatsPerBar) && beatsPerBar! >= 1 && beatsPerBar! <= 12;
    if (!valid) throw new HttpError(400, 'Esperado { bpm: 20–300, offsetSec: 0–60, beatsPerBar: 1–12 }');
    const metronome: MetronomeRecord = { bpm, offsetSec, beatsPerBar: beatsPerBar! };
    if (!(await songs.update(req.params.id, { metronome }))) throw notFound();
    res.json(metronome);
  }),
);

// ---------- upload de música ----------
const multipart = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_LIMITS.stemMaxBytes,
    files: UPLOAD_FILE_FIELDS.length,
    fields: 8,
    fieldSize: 1024,
    fieldNameSize: 32,
    parts: UPLOAD_FILE_FIELDS.length + 8,
  },
}).fields(UPLOAD_FILE_FIELDS);

/** Um upload por vez: cada um pode ocupar ~250 MB de memória. */
let uploadInProgress = false;

app.post(
  '/api/songs',
  uploadLimiter,
  (req, res, next) => {
    if (uploadInProgress) {
      res.status(429).json({ error: 'Já existe um envio em andamento; aguarde terminar.' });
      return;
    }
    uploadInProgress = true;
    res.on('close', () => (uploadInProgress = false));
    next();
  },
  multipart,
  asyncHandler(async (req, res) => {
    const { record, files } = await validateUpload(req.body ?? {}, (req.files ?? {}) as IncomingFiles);
    if (await songs.get(record.id)) throw new HttpError(409, 'Já existe uma música com esse artista e título.');

    const written: string[] = [];
    try {
      for (const f of files) {
        await media.put(record.id, f.name, f.data, f.contentType);
        written.push(f.name);
      }
      if (!(await songs.create(record))) throw new HttpError(409, 'Já existe uma música com esse artista e título.');
    } catch (err) {
      // desfaz só o que este envio gravou (nunca arquivos de outra música)
      await media.remove(record.id, written).catch((e) => console.error('Falha ao desfazer upload:', e));
      throw err;
    }
    res.status(201).json({ id: record.id });
  }),
);

// ---------- arquivos locais e frontend ----------
if (config.storageDriver === 'local') {
  app.use('/media', express.static(songsDir, { fallthrough: false, maxAge: '1h', dotfiles: 'deny', index: false }));
}

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada')));

// Em produção a API também serve o frontend buildado.
if (fs.existsSync(config.webDistDir)) {
  app.use(express.static(config.webDistDir, { index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(config.webDistDir, 'index.html')));
}

app.use(errorHandler);

const server = app.listen(config.port, config.host, () => {
  console.log(`API em http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
});
// Conexões lentas/penduradas não seguram recursos para sempre.
server.requestTimeout = 5 * 60_000;
server.headersTimeout = 30_000;

process.on('unhandledRejection', (err) => console.error('Rejeição não tratada:', err));
