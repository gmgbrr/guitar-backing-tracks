import { describe, expect, it } from 'vitest';
import { parseLrc } from './parseLrc';

describe('parseLrc', () => {
  it('lê metadados e linhas com timestamp', () => {
    const { meta, lines } = parseLrc('[ar: Artista]\r\n[ti: Título]\r\n[00:11.98]primeira linha\r\n[01:02.5]segunda\r\n');
    expect(meta).toEqual({ ar: 'Artista', ti: 'Título' });
    expect(lines).toEqual([
      { time: 11.98, text: 'primeira linha' },
      { time: 62.5, text: 'segunda' },
    ]);
  });

  it('expande vários timestamps na mesma linha e ordena', () => {
    const { lines } = parseLrc('[00:30.00][00:10.00]refrão\n[00:20.00]verso');
    expect(lines.map((l) => [l.time, l.text])).toEqual([
      [10, 'refrão'],
      [20, 'verso'],
      [30, 'refrão'],
    ]);
  });

  it('mantém linhas vazias (pausas instrumentais) e aplica offset', () => {
    const { lines } = parseLrc('[offset: 500]\n[00:05.00]\n[00:10.00]a');
    expect(lines).toEqual([
      { time: 4.5, text: '' },
      { time: 9.5, text: 'a' },
    ]);
  });
});
