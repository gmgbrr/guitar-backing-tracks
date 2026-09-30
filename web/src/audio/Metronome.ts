/**
 * Metrônomo agendado no mesmo AudioContext das faixas.
 *
 * Os cliques ficam numa grade fixa no tempo da música: batida n acontece em `offsetSec + n * 60/bpm`.
 * Um timer curto (padrão "lookahead") agenda os cliques dos próximos ~120 ms com precisão de amostra,
 * convertendo tempo da música para tempo do contexto via `startedAt` do StemPlayer.
 */

export interface MetronomeSettings {
  bpm: number;
  /** Tempo (s) de uma batida "1" do compasso. Define o alinhamento da grade com a música. */
  offsetSec: number;
  beatsPerBar: number;
}

export interface MetronomeState extends MetronomeSettings {
  enabled: boolean;
  volume: number;
}

interface Clock {
  playing: boolean;
  /** ctx.currentTime que corresponde ao tempo 0 da música. */
  startedAt: number;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12; // s
const CLICK_LEN = 0.05; // s

const mod = (a: number, n: number) => ((a % n) + n) % n;

export class Metronome {
  private readonly gain: GainNode;
  private state: MetronomeState = { enabled: false, volume: 0.7, bpm: 120, offsetSec: 0, beatsPerBar: 4 };
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextBeat = 0;
  private scheduled = new Set<OscillatorNode>();

  constructor(
    private readonly ctx: AudioContext,
    private readonly clock: () => Clock,
  ) {
    // Vai direto para a saída: o volume master das faixas não afeta o metrônomo.
    this.gain = ctx.createGain();
    this.gain.gain.value = this.state.volume;
    this.gain.connect(ctx.destination);
  }

  getState(): MetronomeState {
    return this.state;
  }

  get beatSec(): number {
    return 60 / this.state.bpm;
  }

  get barSec(): number {
    return this.beatSec * this.state.beatsPerBar;
  }

  /** Batida atual: índice absoluto e posição dentro do compasso (0 = batida 1). */
  beatAt(songTime: number): { index: number; inBar: number } {
    const index = Math.floor((songTime - this.state.offsetSec) / this.beatSec + 1e-6);
    return { index, inBar: mod(index, this.state.beatsPerBar) };
  }

  update(patch: Partial<MetronomeState>) {
    const next = { ...this.state, ...patch };
    next.bpm = Math.min(300, Math.max(20, next.bpm));
    next.beatsPerBar = Math.min(12, Math.max(1, Math.round(next.beatsPerBar)));
    next.volume = Math.min(1.5, Math.max(0, next.volume));
    // Mantém o offset dentro de um compasso: mesma grade, número mais legível.
    next.offsetSec = Math.round(mod(next.offsetSec, (60 / next.bpm) * next.beatsPerBar) * 1000) / 1000;

    const regrid = next.bpm !== this.state.bpm || next.offsetSec !== this.state.offsetSec ||
      next.beatsPerBar !== this.state.beatsPerBar || next.enabled !== this.state.enabled;
    this.state = next;
    this.gain.gain.setTargetAtTime(next.volume, this.ctx.currentTime, 0.015);
    if (regrid) this.restart();
  }

  /** Chamado pelo StemPlayer quando a reprodução começa (play/seek). */
  start() {
    this.stop();
    const { playing, startedAt } = this.clock();
    if (!this.state.enabled || !playing) return;
    const songTime = this.ctx.currentTime - startedAt;
    this.nextBeat = Math.ceil((songTime - this.state.offsetSec) / this.beatSec - 1e-6);
    this.schedule();
    this.timer = setInterval(() => this.schedule(), LOOKAHEAD_MS);
  }

  /** Para o agendamento e silencia cliques já agendados (pause/seek). */
  stop() {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    for (const osc of this.scheduled) {
      try {
        osc.stop();
      } catch {
        /* ainda não começou ou já parou */
      }
      osc.disconnect();
    }
    this.scheduled.clear();
  }

  dispose() {
    this.stop();
    this.gain.disconnect();
  }

  private restart() {
    if (this.clock().playing) this.start();
    else this.stop();
  }

  private schedule() {
    const { startedAt } = this.clock();
    const now = this.ctx.currentTime;
    const horizon = now + SCHEDULE_AHEAD;
    for (;;) {
      const songTime = this.state.offsetSec + this.nextBeat * this.beatSec;
      const when = startedAt + songTime;
      if (when > horizon) break;
      if (when >= now - 0.005 && songTime >= 0) {
        this.click(Math.max(when, now), mod(this.nextBeat, this.state.beatsPerBar) === 0);
      }
      this.nextBeat++;
    }
  }

  private click(when: number, accent: boolean) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1760 : 1175;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, when + CLICK_LEN);
    osc.connect(env).connect(this.gain);
    osc.start(when);
    osc.stop(when + CLICK_LEN + 0.01);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
      this.scheduled.delete(osc);
    };
    this.scheduled.add(osc);
  }
}
