import { FieldValue, Firestore } from '@google-cloud/firestore';
import type { SongRecord } from '@backing-tracks/shared';
import { isValidSongId, type SongRepository } from './SongRepository.js';

/** gRPC ALREADY_EXISTS */
const ALREADY_EXISTS = 6;

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
    if (!isValidSongId(id)) return undefined;
    const doc = await this.songs.doc(id).get();
    return doc.exists ? { ...(doc.data() as SongRecord), id: doc.id } : undefined;
  }

  async create(song: SongRecord): Promise<boolean> {
    if (!isValidSongId(song.id)) throw new Error(`Id inválido: ${song.id}`);
    try {
      await this.songs.doc(song.id).create(song); // falha se o documento já existir
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === ALREADY_EXISTS) return false;
      throw err;
    }
  }

  async update(id: string, patch: Partial<Omit<SongRecord, 'id'>>): Promise<SongRecord | undefined> {
    if (!isValidSongId(id)) return undefined;
    const ref = this.songs.doc(id);
    // Campo `undefined` no patch = remover o campo (ex.: DELETE /video).
    const data = Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, v === undefined ? FieldValue.delete() : v]),
    );
    try {
      await ref.update(data); // falha (NOT_FOUND) se a música não existir — não cria documentos
    } catch (err) {
      if ((err as { code?: number }).code === 5) return undefined; // gRPC NOT_FOUND
      throw err;
    }
    return this.get(id);
  }
}
