import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import type { SongDetail, SongSummary } from '@backing-tracks/shared';
import { config } from './config.js';
import { JsonSongRepository } from './repositories/JsonSongRepository.js';
import type { SongRepository } from './repositories/SongRepository.js';
import { LocalMediaStorage } from './storage/LocalMediaStorage.js';
import type { MediaStorage } from './storage/MediaStorage.js';

const songsDir = path.join(config.dataDir, 'songs');

function createAdapters(): { songs: SongRepository; media: MediaStorage } {
  switch (config.storageDriver) {
    case 'local':
      return { songs: new JsonSongRepository(songsDir), media: new LocalMediaStorage() };
    default:
      throw new Error(`STORAGE_DRIVER desconhecido: ${config.storageDriver}`);
  }
}

const { songs, media } = createAdapters();
const app = express();
app.use(cors());

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
