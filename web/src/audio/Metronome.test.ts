import { describe, expect, it } from 'vitest';
import { Metronome } from './Metronome';

/** AudioContext mínimo: só o necessário para configurar a grade (sem tocar nada). */
function fakeCtx() {
  const node = () => ({ gain: { value: 1, setTargetAtTime() {} }, connect() {}, disconnect() {} });
  return { currentTime: 0, destination: {}, createGain: node } as unknown as AudioContext;
}

const make = () => new Metronome(fakeCtx(), () => ({ playing: false, startedAt: 0 }));

describe('Metronome', () => {
  it('calcula batida e posição no compasso a partir do offset', () => {
    const m = make();
    m.update({ bpm: 120, offsetSec: 1, beatsPerBar: 4 }); // batida a cada 0,5 s
    expect(m.beatAt(1)).toEqual({ index: 0, inBar: 0 });
    expect(m.beatAt(1.49)).toEqual({ index: 0, inBar: 0 });
    expect(m.beatAt(1.5)).toEqual({ index: 1, inBar: 1 });
    expect(m.beatAt(3)).toEqual({ index: 4, inBar: 0 });
    // antes do offset a grade continua para trás
    expect(m.beatAt(0.5)).toEqual({ index: 0 - 1, inBar: 3 });
  });

  it('normaliza o offset para dentro de um compasso (mesma grade)', () => {
    const m = make();
    m.update({ bpm: 120, beatsPerBar: 4, offsetSec: 5.25 }); // compasso = 2 s
    expect(m.getState().offsetSec).toBe(1.25);
    m.update({ offsetSec: -0.25 });
    expect(m.getState().offsetSec).toBe(1.75);
  });

  it('limita BPM, compasso e volume a faixas válidas', () => {
    const m = make();
    m.update({ bpm: 1000, beatsPerBar: 0, volume: 9 });
    expect(m.getState()).toMatchObject({ bpm: 300, beatsPerBar: 1, volume: 1.5 });
  });
});
