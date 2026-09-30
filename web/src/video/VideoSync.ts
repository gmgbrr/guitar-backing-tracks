import type { StemPlayer } from '../audio/StemPlayer';
import { YTState, type YTPlayer } from './youtube';

const CHECK_MS = 250;
const DRIFT_PLAYING = 0.3; // s de desvio tolerado com a track tocando
const DRIFT_PAUSED = 0.05; // s com a track parada (quadro exato)
const SEEK_COOLDOWN_MS = 1200; // espera após reposicionar antes de corrigir de novo (buffer do YouTube)

/** Tempo do vídeo que corresponde ao tempo da track. */
export const videoTimeFor = (trackTime: number, offsetSec: number) => trackTime - offsetSec;

/**
 * Mantém um vídeo do YouTube (mudo, sem controles) seguindo o relógio do StemPlayer.
 * A track é a referência: o vídeo só é pausado, tocado e reposicionado para acompanhá-la.
 */
export class VideoSync {
  private timer: ReturnType<typeof setInterval>;
  private unsubscribe: () => void;
  private lastSeek = 0;
  private preview: number | null = null;

  constructor(
    private readonly yt: YTPlayer,
    private readonly player: StemPlayer,
    private offsetSec: number,
  ) {
    this.unsubscribe = player.subscribe(() => this.check(true));
    this.timer = setInterval(() => this.check(), CHECK_MS);
    this.check(true);
  }

  setOffset(offsetSec: number) {
    this.offsetSec = offsetSec;
    this.check(true);
  }

  /** Modo de ajuste: desacopla o vídeo da track e mostra o tempo informado (null volta a seguir). */
  setPreview(videoTime: number | null) {
    this.preview = videoTime;
    this.check(true);
  }

  getVideoTime(): number {
    return this.yt.getCurrentTime();
  }

  getDuration(): number {
    return this.yt.getDuration();
  }

  /** Garante mudo sempre (chamado também a cada mudança de estado do player do YouTube). */
  enforceMute() {
    if (!this.yt.isMuted()) this.yt.mute();
  }

  dispose() {
    clearInterval(this.timer);
    this.unsubscribe();
  }

  private seek(t: number) {
    this.yt.seekTo(t, true);
    this.lastSeek = performance.now();
  }

  private check(force = false) {
    this.enforceMute();
    const state = this.yt.getPlayerState();
    const current = this.yt.getCurrentTime();
    const duration = this.yt.getDuration() || Infinity;
    const isPlaying = state === YTState.PLAYING || state === YTState.BUFFERING;

    if (this.preview !== null) {
      if (isPlaying) this.yt.pauseVideo();
      if (Math.abs(current - this.preview) > DRIFT_PAUSED) this.seek(this.preview);
      return;
    }

    const target = videoTimeFor(this.player.getTime(), this.offsetSec);
    const trackPlaying = this.player.getSnapshot().playing;

    // Fora do trecho do vídeo: fica parado no primeiro/último quadro.
    if (target < 0 || target >= duration) {
      if (isPlaying) this.yt.pauseVideo();
      const edge = target < 0 ? 0 : Math.max(0, duration - 0.1);
      if (Math.abs(current - edge) > DRIFT_PAUSED) this.seek(edge);
      return;
    }

    if (!trackPlaying) {
      if (isPlaying) this.yt.pauseVideo();
      if (Math.abs(current - target) > DRIFT_PAUSED) this.seek(target);
      return;
    }

    const cooling = performance.now() - this.lastSeek < SEEK_COOLDOWN_MS;
    if (!isPlaying) {
      if (force || !cooling) this.seek(target);
      this.yt.playVideo();
      return;
    }
    if (state === YTState.BUFFERING && !force) return;
    if (Math.abs(current - target) > DRIFT_PLAYING && (force || !cooling)) this.seek(target);
  }
}
