import { FieldValue, Firestore } from '@google-cloud/firestore';
import type { SongRecord } from '@backing-tracks/shared';
import type { SongRepository } from './SongRepository.js';

/** Coleção `songs`: um documento por música, com o mesmo conteúdo do song.json (id = slug). */
export class FirestoreSongRepository implements SongRepository {
  private readonly songs;

  constructor(db: Firestore) {
    this.songs = db.collection('songs');
  }

  async list(): Promise<SongRecord[]> {
    const snap = await this.songs.get();
    return snap.docs
      .map((d) => ({ ...(d.data() as SongRecord), id: d.id }))
      .sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
  }

  async get(id: string): Promise<SongRecord | undefined> {
    if (!/^[a-z0-9-]+$/.test(id)) return undefined;
    const doc = await this.songs.doc(id).get();
    return doc.exists ? { ...(doc.data() as SongRecord), id: doc.id } : undefined;
  }

  async update(id: string, patch: Partial<Omit<SongRecord, 'id'>>): Promise<SongRecord | undefined> {
    const ref = this.songs.doc(id);
    if (!(await ref.get()).exists) return undefined;
    // Campo `undefined` no patch = remover o campo (ex.: DELETE /video).
    const data = Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, v === undefined ? FieldValue.delete() : v]),
    );
    await ref.set(data, { merge: true });
    return this.get(id);
  }
}
