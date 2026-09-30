export { activeLineIndex } from '../sync/timeline';

export interface LyricLine {
  time: number; // segundos
  text: string;
}

export interface ParsedLrc {
  meta: Record<string, string>;
  lines: LyricLine[];
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const META_TAG = /^\[([a-z#]+):\s*(.*)\]$/i;

/** Parser LRC: suporta vários timestamps por linha, tag [offset:] e ignora metadados na letra. */
export function parseLrc(source: string): ParsedLrc {
  const meta: Record<string, string> = {};
  const lines: LyricLine[] = [];

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const times: number[] = [];
    let lastIndex = 0;
    TIME_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TIME_TAG.exec(line)) && m.index === lastIndex) {
      times.push(Number(m[1]) * 60 + Number(m[2].replace(':', '.')));
      lastIndex = TIME_TAG.lastIndex;
    }

    if (times.length === 0) {
      const mm = META_TAG.exec(line);
      if (mm) meta[mm[1].toLowerCase()] = mm[2].trim();
      continue;
    }

    const text = line.slice(lastIndex).trim();
    for (const time of times) lines.push({ time, text });
  }

  const offsetSec = Number(meta.offset ?? 0) / 1000 || 0;
  for (const l of lines) l.time = Math.max(0, l.time - offsetSec);
  lines.sort((a, b) => a.time - b.time);
  return { meta, lines };
}
