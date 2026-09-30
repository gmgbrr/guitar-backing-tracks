import { describe, expect, it } from 'vitest';
import { activeLineIndex } from './timeline';

const items = [0, 5, 10].map((time) => ({ time }));

describe('activeLineIndex', () => {
  it.each([
    [-1, -1],
    [0, 0],
    [4.99, 0],
    [5, 1],
    [100, 2],
  ])('t=%s → %s', (t, idx) => expect(activeLineIndex(items, t)).toBe(idx));
});
