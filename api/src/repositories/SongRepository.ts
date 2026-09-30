import type { SongRecord } from '@backing-tracks/shared';

/** Fonte de metadados das músicas. Implementações: JSON em disco (local) e Firestore (nuvem). */
export interface SongRepository {
  list(): Promise<SongRecord[]>;
  get(id: string): Promise<SongRecord | undefined>;
  /** Cria a música; retorna false se o id já existir (nunca sobrescreve). */
  create(song: SongRecord): Promise<boolean>;
  /** Grava campos de nível superior do registro. Retorna o registro atualizado. */
  update(id: string, patch: Partial<Omit<SongRecord, 'id'>>): Promise<SongRecord | undefined>;
}

/** Mesmo formato aceito pela API: slug minúsculo, sem barras nem pontos. */
export const isValidSongId = (id: string) => /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/.test(id);
