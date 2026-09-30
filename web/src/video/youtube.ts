/** Tipos mínimos da YouTube IFrame Player API (https://developers.google.com/youtube/iframe_api_reference). */
export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  isMuted(): boolean;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

export const YTState = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Carrega o script da IFrame API uma única vez. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('Não foi possível carregar o player do YouTube (sem internet?)'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

/** Extrai o ID (11 caracteres) de um link do YouTube em qualquer formato comum, ou do próprio ID. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let url: URL;
  try {
    url = new URL(s.startsWith('http') ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/)?.[1] ?? null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** Mensagens para os códigos de erro do player. */
export function youTubeErrorMessage(code: number): string {
  switch (code) {
    case 2:
      return 'ID de vídeo inválido.';
    case 5:
      return 'O navegador não conseguiu reproduzir este vídeo.';
    case 100:
      return 'Vídeo não encontrado (removido ou privado).';
    case 101:
    case 150:
      return 'O dono do vídeo não permite exibi-lo fora do YouTube.';
    default:
      return `Erro do player do YouTube (${code}).`;
  }
}
