/** Registro persistido de uma música (song.json local / documento Firestore no futuro). */
export interface SongRecord {
  id: string;
  title: string;
  artist: string;
  key?: string;
  bpm?: number;
  durationSec: number;
  stems: StemRecord[];
  lyricsFile?: string;
}

export interface StemRecord {
  name: string;
  file: string;
}

/** Item da lista de músicas retornado por GET /api/songs. */
export interface SongSummary {
  id: string;
  title: string;
  artist: string;
  key?: string;
  bpm?: number;
  durationSec: number;
  stemNames: string[];
  hasLyrics: boolean;
}

/** Detalhe retornado por GET /api/songs/:id, com URLs de mídia já resolvidas. */
export interface SongDetail extends Omit<SongRecord, 'stems' | 'lyricsFile'> {
  stems: { name: string; url: string }[];
  lyricsUrl?: string;
}
