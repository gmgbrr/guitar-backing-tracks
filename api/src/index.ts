import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import type { MetronomeRecord, SongDetail, SongSummary, VideoRecord } from '@backing-tracks/shared';
import { config } from './config.js';
import { JsonSongRepository } from './repositories/JsonSongRepository.js';
import type { SongRepository } from './repositories/SongRepository.js';
import { LocalMediaStorage } from './storage/LocalMediaStorage.js';
import type { MediaStorage } from './storage/MediaStorage.js';

const songsDir = path.join(config.dataDir, 'songs');

function createAdapters(): { songs: SongRepository; media: MediaStorage } {
  switch (config.storageDriver) {
    case 'local':
      return { songs: new JsonSongRepository(songsDir), media: new LocalMediaStorage(songsDir) };
    default:
      throw new Error(`STORAGE_DRIVER desconhecido: ${config.storageDriver}`);
  }
}

const { songs, media } = createAdapters();
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/songs', async (_req, res) => {
  const list = await songs.list();
  const summaries: SongSummary[] = list.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    key: s.key,
    bpm: s.bpm,
    durationSec: s.durationSec,
    stemNames: s.stems.map((st) => st.name),
    hasLyrics: Boolean(s.lyricsFile),
    hasVideo: Boolean(s.video),
  }));
  res.json(summaries);
});

app.get('/api/songs/:id', async (req, res) => {
  const song = await songs.get(req.params.id);
  if (!song) {
    res.status(404).json({ error: 'Música não encontrada' });
    return;
  }
  const { stems, lyricsFile, ...rest } = song;
  const detail: SongDetail = {
    ...rest,
    stems: await Promise.all(
      stems.map(async (st) => ({ name: st.name, url: await media.getUrl(song.id, st.file) })),
    ),
    lyricsUrl: lyricsFile ? await media.getUrl(song.id, lyricsFile) : undefined,
  };
  res.json(detail);
});

app.put('/api/songs/:id/video', async (req, res) => {
  const { youtubeId, offsetSec } = req.body as Partial<VideoRecord>;
  const valid =
    typeof youtubeId === 'string' && /^[\w-]{11}$/.test(youtubeId) &&
    typeof offsetSec === 'number' && Number.isFinite(offsetSec) && Math.abs(offsetSec) <= 3600;
  if (!valid) {
    res.status(400).json({ error: 'Esperado { youtubeId: id de 11 caracteres, offsetSec: número }' });
    return;
  }
  const video: VideoRecord = { youtubeId, offsetSec: Math.round(offsetSec * 1000) / 1000 };
  const updated = await songs.update(req.params.id, { video });
  if (!updated) {
    res.status(404).json({ error: 'Música não encontrada' });
    return;
  }
  res.json(video);
});

app.delete('/api/songs/:id/video', async (req, res) => {
  const updated = await songs.update(req.params.id, { video: undefined });
  if (!updated) {
    res.status(404).json({ error: 'Música não encontrada' });
    return;
  }
  res.status(204).end();
});

app.put('/api/songs/:id/metronome', async (req, res) => {
  const { bpm, offsetSec, beatsPerBar } = req.body as Partial<MetronomeRecord>;
  const valid =
    typeof bpm === 'number' && bpm >= 20 && bpm <= 300 &&
    typeof offsetSec === 'number' && offsetSec >= 0 && offsetSec < 60 &&
    Number.isInteger(beatsPerBar) && beatsPerBar! >= 1 && beatsPerBar! <= 12;
  if (!valid) {
    res.status(400).json({ error: 'Esperado { bpm: 20–300, offsetSec: 0–60, beatsPerBar: 1–12 }' });
    return;
  }
  const metronome: MetronomeRecord = { bpm, offsetSec, beatsPerBar: beatsPerBar! };
  const updated = await songs.update(req.params.id, { metronome });
  if (!updated) {
    res.status(404).json({ error: 'Música não encontrada' });
    return;
  }
  res.json(metronome);
});

if (config.storageDriver === 'local') {
  app.use('/media', express.static(songsDir, { fallthrough: false, maxAge: '1h' }));
}

// Em produção a API também serve o frontend buildado.
if (fs.existsSync(config.webDistDir)) {
  app.use(express.static(config.webDistDir));
  app.get('*', (_req, res) => res.sendFile(path.join(config.webDistDir, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`API em http://localhost:${config.port} (dados: ${config.dataDir})`);
});
