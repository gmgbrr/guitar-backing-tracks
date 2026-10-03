import { describe, expect, it } from 'vitest';
import { normalizeNote, normalizeTuning, STANDARD_TUNING, tuningLabel, tuningOf } from './tuning';

describe('normalizeNote', () => {
  it.each([
    ['E', 'E'],
    ['e', 'E'],
    ['F#', 'F#'],
    ['f#', 'F#'],
    ['Eb', 'D#'],
    ['Bb', 'A#'],
    ['Cb', 'B'],
    ['E#', 'F'],
  ])('%s → %s', (input, out) => expect(normalizeNote(input)).toBe(out));

  it.each(['H', 'E##', '', 'Do', 5, null, '<script>'])('rejeita %s', (input) => expect(normalizeNote(input)).toBeNull());
});

describe('normalizeTuning', () => {
  it('aceita 6 notas e converte bemóis', () => {
    expect(normalizeTuning(['Eb', 'Ab', 'Db', 'Gb', 'Bb', 'Eb'])).toEqual(['D#', 'G#', 'C#', 'F#', 'A#', 'D#']);
  });
  it('rejeita quantidade errada ou nota inválida', () => {
    expect(normalizeTuning(['E', 'A', 'D', 'G', 'B'])).toBeNull();
    expect(normalizeTuning(['E', 'A', 'D', 'G', 'B', 'X'])).toBeNull();
    expect(normalizeTuning('E A D G B E')).toBeNull();
  });
});

describe('tuningOf / tuningLabel', () => {
  it('música sem afinação é padrão', () => expect(tuningOf({})).toEqual(STANDARD_TUNING));
  it('nomeia afinações conhecidas e mostra as notas nas demais', () => {
    expect(tuningLabel(STANDARD_TUNING)).toBe('Padrão');
    expect(tuningLabel(['D', 'A', 'D', 'G', 'B', 'E'])).toBe('Drop D');
    expect(tuningLabel(['F', 'A', 'D', 'G', 'B', 'E'])).toBe('F A D G B E');
  });
});
