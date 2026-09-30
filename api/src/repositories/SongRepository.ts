import type { SongRecord } from '@backing-tracks/shared';

/** Fonte de metadados das músicas. Implementação local: JSON em disco; futura: Firestore. */
export interface SongRepository {
  list(): Promise<SongRecord[]>;
  get(id: string): Promise<SongRecord | undefined>;
}
