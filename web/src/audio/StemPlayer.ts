/**
 * Toca vários stems em sincronia exata usando Web Audio.
 *
 * Grafo: AudioBufferSourceNode (por stem) → GainNode (por stem) → master GainNode → saída.
 * Todos os sources recebem o mesmo instante em start(), então ficam alinhados por amostra.
 * AudioBufferSourceNode só toca uma vez: pause/seek descartam os sources e play cria novos.
 */

import { Metronome, type MetronomeState } from './Metronome';

export interface StemState {
  name: string;
  volume: number; // 0..1.5
  muted: boolean;
  solo: boolean;
}

export interface PlayerSnapshot {
  playing: boolean;
  duration: number;
  masterVolume: number;
  stems: StemState[];
  metronome: MetronomeState;
}

interface Stem extends StemState {
  buffer: AudioBuffer;
  gain: GainNode;
  source?: AudioBufferSourceNode;
}

const START_DELAY = 0.05; // s — margem para agendar todos os starts no mesmo instante
const GAIN_SMOOTHING = 0.015; // s — evita cliques ao mudar volume

export class StemPlayer {
  private readonly ctx = new AudioContext();
  private readonly master = this.ctx.createGain();
  private stems: Stem[] = [];
  private playing = false;
  private offset = 0; // posição (s) quando pausado
  private startedAt = 0; // ctx.currentTime equivalente à posição 0
  private listeners = new Set<() => void>();
  private readonly metronome = new Metronome(this.ctx, () => ({ playing: this.playing, startedAt: this.startedAt }));
  private snapshot: PlayerSnapshot = {
    playing: false,
    duration: 0,
    masterVolume: 1,
    stems: [],
    metronome: this.metronome.getState(),
  };

  constructor() {
    this.master.connect(this.ctx.destination);
    // iOS: sem isto o Web Audio fica mudo com a chave de silencioso ligada (Safari 16.4+).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
  }

  async load(stems: { name: string; url: string }[], onProgress?: (loaded: number, total: number) => void) {
    let loaded = 0;
    const decoded = await Promise.all(
      stems.map(async ({ name, url }) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Falha ao baixar ${name} (${res.status})`);
        const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
        onProgress?.(++loaded, stems.length);
        return { name, buffer };
      }),
    );
    this.stems = decoded.map(({ name, buffer }) => {
      const gain = this.ctx.createGain();
      gain.connect(this.master);
      return { name, buffer, gain, volume: 1, muted: false, solo: false };
    });
    this.applyGains();
    this.emit();
  }

  get duration(): number {
    return Math.max(0, ...this.stems.map((s) => s.buffer.duration));
  }

  /** Posição atual em segundos. */
  getTime(): number {
    if (!this.playing) return this.offset;
    return Math.min(this.duration, Math.max(0, this.ctx.currentTime - this.startedAt));
  }

  async play() {
    if (this.playing || this.stems.length === 0) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.offset >= this.duration) this.offset = 0;

    const when = this.ctx.currentTime + START_DELAY;
    this.startedAt = when - this.offset;
    for (const stem of this.stems) {
      const source = this.ctx.createBufferSource();
      source.buffer = stem.buffer;
      source.connect(stem.gain);
      source.start(when, this.offset);
      stem.source = source;
    }
    // Detecta fim natural da música pelo stem mais longo.
    const longest = this.stems.reduce((a, b) => (b.buffer.duration > a.buffer.duration ? b : a));
    const source = longest.source!;
    source.onended = () => {
      if (longest.source !== source) return; // parado por pause/seek
      this.stopSources();
      this.playing = false;
      this.offset = this.duration;
      this.emit();
    };
    this.playing = true;
    this.metronome.start();
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.getTime();
    this.stopSources();
    this.playing = false;
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else void this.play();
  }

  seek(time: number) {
    const wasPlaying = this.playing;
    if (wasPlaying) {
      this.stopSources();
      this.playing = false;
    }
    this.offset = Math.min(this.duration, Math.max(0, time));
    if (wasPlaying) void this.play();
    else this.emit();
  }

  skip(delta: number) {
    this.seek(this.getTime() + delta);
  }

  setVolume(name: string, volume: number) {
    this.updateStem(name, { volume });
  }

  toggleMute(name: string) {
    const s = this.stems.find((x) => x.name === name);
    if (s) this.updateStem(name, { muted: !s.muted });
  }

  toggleSolo(name: string) {
    const s = this.stems.find((x) => x.name === name);
    if (s) this.updateStem(name, { solo: !s.solo });
  }

  setMasterVolume(volume: number) {
    this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, GAIN_SMOOTHING);
    this.snapshot = { ...this.snapshot, masterVolume: volume };
    this.emit(false);
  }

  updateMetronome(patch: Partial<MetronomeState>) {
    this.metronome.update(patch);
    this.emit();
  }

  /** Alinha a grade do metrônomo para que o tempo atual seja uma batida "1". */
  alignMetronomeDownbeat() {
    this.updateMetronome({ offsetSec: this.getTime() });
  }

  /** Batida do metrônomo no tempo informado (0 = batida 1 do compasso). */
  metronomeBeatAt(songTime: number) {
    return this.metronome.beatAt(songTime);
  }

  resetMix() {
    for (const s of this.stems) Object.assign(s, { volume: 1, muted: false, solo: false });
    this.applyGains();
    this.emit();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  dispose() {
    this.stopSources();
    this.metronome.dispose();
    this.listeners.clear();
    void this.ctx.close();
  }

  private updateStem(name: string, patch: Partial<StemState>) {
    const s = this.stems.find((x) => x.name === name);
    if (!s) return;
    Object.assign(s, patch);
    this.applyGains();
    this.emit();
  }

  private applyGains() {
    const anySolo = this.stems.some((s) => s.solo);
    for (const s of this.stems) {
      const audible = anySolo ? s.solo : !s.muted;
      s.gain.gain.setTargetAtTime(audible ? s.volume : 0, this.ctx.currentTime, GAIN_SMOOTHING);
    }
  }

  private stopSources() {
    this.metronome.stop();
    for (const s of this.stems) {
      if (!s.source) continue;
      s.source.onended = null;
      try {
        s.source.stop();
      } catch {
        /* já parado */
      }
      s.source.disconnect();
      s.source = undefined;
    }
  }

  private emit(rebuild = true) {
    if (rebuild) {
      this.snapshot = {
        playing: this.playing,
        duration: this.duration,
        masterVolume: this.snapshot.masterVolume,
        metronome: this.metronome.getState(),
        stems: this.stems.map(({ name, volume, muted, solo }) => ({ name, volume, muted, solo })),
      };
    }
    for (const l of this.listeners) l();
  }
}
