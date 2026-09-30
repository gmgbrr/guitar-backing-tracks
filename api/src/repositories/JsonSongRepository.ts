import fs from 'node:fs/promises';
import path from 'node:path';
import type { SongRecord } from '@backing-tracks/shared';
import type { SongRepository } from './SongRepository.js';

/** Lê data/songs/<id>/song.json. */
export class JsonSongRepository implements SongRepository {
  constructor(private readonly songsDir: string) {}

  async list(): Promise<SongRecord[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.songsDir);
    } catch {
      return [];
    }
    const songs = await Promise.all(entries.map((id) => this.get(id)));
    return songs
      .filter((s): s is SongRecord => s !== undefined)
      .sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
  }

  async get(id: string): Promise<SongRecord | undefined> {
    if (!/^[a-z0-9-]+$/.test(id)) return undefined;
    try {
      const raw = await fs.readFile(path.join(this.songsDir, id, 'song.json'), 'utf8');
      return JSON.parse(raw) as SongRecord;
    } catch {
      return undefined;
    }
  }
}
