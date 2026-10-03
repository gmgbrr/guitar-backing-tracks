/**
 * Afinação de guitarra (6 cordas), da 6ª corda (mais grave) para a 1ª (mais aguda).
 * Notas guardadas com sustenido; bemóis são aceitos na entrada e convertidos.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type NoteName = (typeof NOTE_NAMES)[number];
export type Tuning = NoteName[];

export const STRING_COUNT = 6;
export const STANDARD_TUNING: Tuning = ['E', 'A', 'D', 'G', 'B', 'E'];

/** Afinações comuns, oferecidas como atalho na tela de criação. */
export const TUNING_PRESETS: { name: string; notes: Tuning }[] = [
  { name: 'Padrão', notes: STANDARD_TUNING },
  { name: 'Drop D', notes: ['D', 'A', 'D', 'G', 'B', 'E'] },
  { name: 'Meio tom abaixo (Eb)', notes: ['D#', 'G#', 'C#', 'F#', 'A#', 'D#'] },
  { name: 'D Standard', notes: ['D', 'G', 'C', 'F', 'A', 'D'] },
  { name: 'Drop C#', notes: ['C#', 'G#', 'C#', 'F#', 'A#', 'D#'] },
  { name: 'Drop C', notes: ['C', 'G', 'C', 'F', 'A', 'D'] },
  { name: 'C Standard', notes: ['C', 'F', 'A#', 'D#', 'G', 'C'] },
  { name: 'Drop B', notes: ['B', 'F#', 'B', 'E', 'G#', 'C#'] },
  { name: 'Open G', notes: ['D', 'G', 'D', 'G', 'B', 'D'] },
  { name: 'Open D', notes: ['D', 'A', 'D', 'F#', 'A', 'D'] },
  { name: 'Open E', notes: ['E', 'B', 'E', 'G#', 'B', 'E'] },
  { name: 'DADGAD', notes: ['D', 'A', 'D', 'G', 'A', 'D'] },
];

const FLAT_TO_SHARP: Record<string, NoteName> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E' };

/** Normaliza uma nota ("eb", "Bb", "f#") para a forma com sustenido; null se inválida. */
export function normalizeNote(input: unknown): NoteName | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!/^[A-Ga-g][#b]?$/.test(s)) return null;
  const note = s[0].toUpperCase() + s.slice(1);
  if ((NOTE_NAMES as readonly string[]).includes(note)) return note as NoteName;
  return FLAT_TO_SHARP[note] ?? (note === 'E#' ? 'F' : note === 'B#' ? 'C' : null);
}

/** Valida e normaliza uma afinação de 6 cordas; null se inválida. */
export function normalizeTuning(input: unknown): Tuning | null {
  if (!Array.isArray(input) || input.length !== STRING_COUNT) return null;
  const notes = input.map(normalizeNote);
  return notes.every((n): n is NoteName => n !== null) ? notes : null;
}

/** Afinação de uma música; registros antigos sem o campo são da afinação padrão. */
export const tuningOf = (song: { tuning?: Tuning }): Tuning => song.tuning ?? STANDARD_TUNING;

export const isStandardTuning = (t: Tuning) => t.every((n, i) => n === STANDARD_TUNING[i]);

/** Nome amigável: "Padrão", "Drop D"… ou as notas ("C G C F A D") se não for uma afinação conhecida. */
export function tuningLabel(t: Tuning): string {
  const preset = TUNING_PRESETS.find((p) => p.notes.every((n, i) => n === t[i]));
  return preset ? preset.name : t.join(' ');
}
