import type { Tuning } from './tuning';

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
  coverFile?: string;
  metronome?: MetronomeRecord;
  video?: VideoRecord;
  /** 6ª → 1ª corda. Ausente = afinação padrão (E A D G B E). */
  tuning?: Tuning;
}

export interface StemRecord {
  name: string;
  file: string;
}

/**
 * Vídeo do YouTube exibido junto com a track (ex.: tablatura rolando).
 * offsetSec = tempo da track em que o vídeo está no segundo 0 (pode ser negativo).
 */
export interface VideoRecord {
  youtubeId: string;
  offsetSec: number;
}

/** Grade do metrônomo da música: batida n em offsetSec + n * 60/bpm. */
export interface MetronomeRecord {
  bpm: number;
  offsetSec: number;
  beatsPerBar: number;
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
  hasVideo: boolean;
  coverUrl?: string;
  tuning: Tuning;
}

/** Detalhe retornado por GET /api/songs/:id, com URLs de mídia já resolvidas. */
export interface SongDetail extends Omit<SongRecord, 'stems' | 'lyricsFile' | 'coverFile' | 'tuning'> {
  tuning: Tuning;
  stems: { name: string; url: string }[];
  lyricsUrl?: string;
  coverUrl?: string;
}
export * from './filenames';
export * from './tuning';
