import type { VideoRecord } from '@backing-tracks/shared';
import { useEffect, useRef, useState } from 'react';
import { deleteVideo, formatTimePrecise, saveVideo } from '../api';
import type { StemPlayer } from '../audio/StemPlayer';
import { useCurrentTime } from '../audio/useStemPlayer';
import { VideoSync } from '../video/VideoSync';
import { loadYouTubeApi, parseYouTubeId, youTubeErrorMessage, type YTPlayer } from '../video/youtube';

interface Props {
  songId: string;
  player: StemPlayer | null;
  playing: boolean;
  video: VideoRecord | null;
  onChange: (video: VideoRecord | null) => void;
}

export function VideoView({ songId, player, playing, video, onChange }: Props) {
  const [editingLink, setEditingLink] = useState(false);
  if (!video || editingLink) {
    return (
      <VideoLinkForm
        songId={songId}
        current={video}
        onSaved={(v) => {
          setEditingLink(false);
          onChange(v);
        }}
        onCancel={video ? () => setEditingLink(false) : undefined}
      />
    );
  }
  return (
    <VideoPlayer
      key={video.youtubeId}
      songId={songId}
      player={player}
      playing={playing}
      video={video}
      onChange={onChange}
      onEditLink={() => setEditingLink(true)}
    />
  );
}

// ---------- cadastro do link ----------

function VideoLinkForm({
  songId,
  current,
  onSaved,
  onCancel,
}: {
  songId: string;
  current: VideoRecord | null;
  onSaved: (v: VideoRecord) => void;
  onCancel?: () => void;
}) {
  const [link, setLink] = useState(current ? `https://www.youtube.com/watch?v=${current.youtubeId}` : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const youtubeId = parseYouTubeId(link);
    if (!youtubeId) {
      setError('Link do YouTube inválido.');
      return;
    }
    // Trocar de vídeo zera a sincronia; manter o mesmo vídeo preserva.
    const v: VideoRecord = { youtubeId, offsetSec: current?.youtubeId === youtubeId ? current.offsetSec : 0 };
    setSaving(true);
    try {
      await saveVideo(songId, v);
      onSaved(v);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <form className="video-empty" onSubmit={submit}>
      <p>Cole o link do vídeo do YouTube com a tablatura desta música.</p>
      <div className="video-link-row">
        <input
          type="url"
          placeholder="https://www.youtube.com/watch?v=…"
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setError(null);
          }}
          autoFocus
        />
        <button className="primary" disabled={saving || !link.trim()}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

// ---------- player sincronizado ----------

function VideoPlayer({
  songId,
  player,
  playing,
  video,
  onChange,
  onEditLink,
}: {
  songId: string;
  player: StemPlayer | null;
  playing: boolean;
  video: VideoRecord;
  onChange: (v: VideoRecord | null) => void;
  onEditLink: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [yt, setYt] = useState<YTPlayer | null>(null);
  const [sync, setSync] = useState<VideoSync | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [offset, setOffset] = useState(video.offsetSec);

  // Cria o player do YouTube: sem controles, sem teclado, mudo.
  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;
    let disposed = false;
    let instance: YTPlayer | null = null;
    const el = document.createElement('div');
    container.appendChild(el);

    loadYouTubeApi()
      .then((YT) => {
        if (disposed) return;
        instance = new YT.Player(el, {
          videoId: video.youtubeId,
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            iv_load_policy: 3,
            playsinline: 1,
            mute: 1,
            cc_load_policy: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              e.target.mute();
              if (!disposed) setYt(e.target);
            },
            onStateChange: (e) => {
              if (!e.target.isMuted()) e.target.mute();
            },
            onError: (e) => setError(youTubeErrorMessage(e.data)),
          },
        });
      })
      .catch((e: Error) => setError(e.message));

    return () => {
      disposed = true;
      instance?.destroy();
      container.innerHTML = '';
      setYt(null);
    };
  }, [video.youtubeId]);

  // Liga o vídeo ao relógio da track.
  useEffect(() => {
    if (!yt || !player) return;
    const s = new VideoSync(yt, player, video.offsetSec);
    setSync(s);
    return () => {
      s.dispose();
      setSync(null);
    };
    // offset é aplicado pelo efeito abaixo, sem recriar o sincronizador
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yt, player]);

  useEffect(() => sync?.setOffset(offset), [sync, offset]);

  const remove = async () => {
    if (!confirm('Remover o vídeo desta música?')) return;
    await deleteVideo(songId);
    onChange(null);
  };

  return (
    <div className="video-view">
      <div className="video-toolbar">
        <span className="muted">
          Vídeo começa em <strong>{formatOffset(video.offsetSec)}</strong> da track
        </span>
        <div className="video-actions">
          <a
            className="youtube-link"
            href={`https://www.youtube.com/watch?v=${video.youtubeId}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir o vídeo original no YouTube (no ponto atual da música)"
            aria-label="Abrir no YouTube"
            onClick={(e) => {
              // Abre no mesmo ponto da música; antes do início do vídeo, abre do começo.
              const t = player ? Math.max(0, Math.floor(player.getTime() - video.offsetSec)) : 0;
              e.currentTarget.href = `https://www.youtube.com/watch?v=${video.youtubeId}${t > 0 ? `&t=${t}s` : ''}`;
            }}
          >
            <svg viewBox="0 0 28 20" width="24" height="17" aria-hidden="true">
              <rect width="28" height="20" rx="5" fill="#ff0000" />
              <path d="M11 5.5v9l8-4.5z" fill="#fff" />
            </svg>
          </a>
          <button className={adjusting ? 'on' : ''} onClick={() => setAdjusting((a) => !a)} disabled={!sync}>
            Ajustar sincronia
          </button>
          <button onClick={onEditLink}>Trocar vídeo</button>
          <button onClick={remove}>Remover</button>
        </div>
      </div>

      <div className="video-frame">
        <div ref={hostRef} className="video-host" />
        {/* Bloqueia qualquer interação com o player do YouTube: quem manda é a track. */}
        <div className="video-shield" />
        {!yt && !error && <div className="video-status">Carregando vídeo…</div>}
        {error && <div className="video-status error">{error}</div>}
      </div>

      {adjusting && sync && player && (
        <SyncPanel
          songId={songId}
          player={player}
          playing={playing}
          sync={sync}
          video={video}
          offset={offset}
          setOffset={setOffset}
          onSaved={(v) => {
            onChange(v);
            setAdjusting(false);
          }}
          onCancel={() => {
            setOffset(video.offsetSec);
            setAdjusting(false);
          }}
        />
      )}
    </div>
  );
}

const formatOffset = (s: number) => `${s < 0 ? '−' : ''}${formatTimePrecise(Math.abs(s))}`;

// ---------- painel de ajuste ----------

function SyncPanel({
  songId,
  player,
  playing,
  sync,
  video,
  offset,
  setOffset,
  onSaved,
  onCancel,
}: {
  songId: string;
  player: StemPlayer;
  playing: boolean;
  sync: VideoSync;
  video: VideoRecord;
  offset: number;
  setOffset: (o: number) => void;
  onSaved: (v: VideoRecord) => void;
  onCancel: () => void;
}) {
  const trackTime = useCurrentTime(player, playing);
  const [preview, setPreview] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duration = sync.getDuration() || 0;

  useEffect(() => sync.setPreview(preview), [sync, preview]);
  // Tocar a track sai do modo "mover só o vídeo".
  useEffect(() => {
    if (playing) setPreview(null);
  }, [playing]);
  useEffect(() => () => sync.setPreview(null), [sync]);

  const round = (t: number) => Math.round(t * 1000) / 1000;
  const nudgeOffset = (d: number) => setOffset(round(offset + d));
  const nudgePreview = (d: number) => {
    player.pause();
    setPreview((p) => Math.min(duration, Math.max(0, (p ?? sync.getVideoTime()) + d)));
  };
  const align = () => {
    if (preview === null) return;
    setOffset(round(trackTime - preview));
    setPreview(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const v = { youtubeId: video.youtubeId, offsetSec: offset };
      await saveVideo(songId, v);
      onSaved(v);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const videoShown = preview ?? trackTime - offset;

  return (
    <div className="video-sync">
      <ol className="video-sync-steps">
        <li>Pause a track num ponto fácil de reconhecer (ex.: a primeira nota).</li>
        <li>Mova só o vídeo até o mesmo ponto.</li>
        <li>
          Clique em <strong>Alinhar</strong> e dê play para conferir.
        </li>
      </ol>

      <div className="video-sync-row">
        <span className="label">Vídeo</span>
        <button onClick={() => nudgePreview(-1)}>−1s</button>
        <button onClick={() => nudgePreview(-0.1)}>−0,1</button>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.05}
          value={Math.min(Math.max(videoShown, 0), duration || 1)}
          onChange={(e) => {
            player.pause();
            setPreview(Number(e.target.value));
          }}
          style={{ '--progress': `${(Math.max(videoShown, 0) / (duration || 1)) * 100}%` } as React.CSSProperties}
          aria-label="Posição do vídeo"
        />
        <button onClick={() => nudgePreview(0.1)}>+0,1</button>
        <button onClick={() => nudgePreview(1)}>+1s</button>
        <span className="t">{formatTimePrecise(Math.max(videoShown, 0))}</span>
      </div>

      <div className="video-sync-row">
        <span className="label">Track</span>
        <span className="t">{formatTimePrecise(trackTime)}</span>
        <button className="primary" onClick={align} disabled={preview === null}>
          Alinhar vídeo com a track
        </button>
        <button onClick={() => setOffset(round(trackTime))} title="O segundo 0 do vídeo passa a ser o ponto atual da track">
          Vídeo começa agora
        </button>
      </div>

      <div className="video-sync-row">
        <span className="label">Início</span>
        <button onClick={() => nudgeOffset(-1)}>−1s</button>
        <button onClick={() => nudgeOffset(-0.1)}>−0,1</button>
        <span className="t">{formatOffset(offset)}</span>
        <button onClick={() => nudgeOffset(0.1)}>+0,1</button>
        <button onClick={() => nudgeOffset(1)}>+1s</button>
        <span className="muted hint">vídeo adiantado → aumente; atrasado → diminua</span>
      </div>

      <div className="video-sync-actions">
        {error && <span className="error">{error}</span>}
        <button onClick={onCancel}>Descartar</button>
        <button className="primary" onClick={save} disabled={saving || offset === video.offsetSec}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
