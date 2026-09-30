import { describe, expect, it } from 'vitest';
import { parseYouTubeId } from './youtube';

describe('parseYouTubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=B2R3WZXzsNA', 'B2R3WZXzsNA'],
    ['https://www.youtube.com/watch?v=B2R3WZXzsNA&t=42s&list=abc', 'B2R3WZXzsNA'],
    ['https://youtu.be/B2R3WZXzsNA?si=xyz', 'B2R3WZXzsNA'],
    ['youtube.com/watch?v=B2R3WZXzsNA', 'B2R3WZXzsNA'],
    ['https://m.youtube.com/watch?v=B2R3WZXzsNA', 'B2R3WZXzsNA'],
    ['https://www.youtube.com/embed/B2R3WZXzsNA', 'B2R3WZXzsNA'],
    ['https://www.youtube.com/shorts/B2R3WZXzsNA', 'B2R3WZXzsNA'],
    ['B2R3WZXzsNA', 'B2R3WZXzsNA'],
  ])('%s', (input, id) => expect(parseYouTubeId(input)).toBe(id));

  it.each(['', 'não é link', 'https://vimeo.com/123456', 'https://www.youtube.com/watch?v=curto'])(
    'rejeita %s',
    (input) => expect(parseYouTubeId(input)).toBeNull(),
  );
});
