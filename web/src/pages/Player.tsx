import type { MetronomeRecord, SongDetail, SongSummary, VideoRecord } from '@backing-tracks/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchSong, fetchSongs, fetchText } from '../api';
import { useStemPlayer } from '../audio/useStemPlayer';
import { LyricsView } from '../components/LyricsView';
import { MetronomePanel } from '../components/MetronomePanel';
import { SeekBar } from '../components/SeekBar';
import { StemMixer } from '../components/StemMixer';
import { Transport } from '../components/Transport';
import { VideoView } from '../components/VideoView';
import { parseLrc, type LyricLine } from '../lyrics/parseLrc';
import { COMPACT_QUERY, useMediaQuery } from '../useMediaQuery';

const KEY_SKIP_SECONDS = 5;

/** 'mixer' só existe como aba no layout de celular; no desktop o mixer fica sempre ao lado. */
type View = 'lyrics' | 'video' | 'mixer';

const defaultMetronome = (s: SongDetail): MetronomeRecord =>
  s.metronome ?? { bpm: s.bpm ?? 120, offsetSec: 0, beatsPerBar: 4 };

export function Player() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [song, setSong] = useState<SongDetail | null>(null);
  const [lines, setLines] = useState<LyricLine[] | null>(null);
  const [video, setVideo] = useState<VideoRecord | null>(null);
  const [view, setView] = useState<View>('lyrics');
  const [savedMetronome, setSavedMetronome] = useState<MetronomeRecord | null>(null);
  const [allSongs, setAllSongs] = useState<SongSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const compact = useMediaQuery(COMPACT_QUERY);

  // Ao sair do layout de celular (girar/redimensionar), a aba Mixer deixa de existir.
  useEffect(() => {
    if (!compact && view === 'mixer') setView(video ? 'video' : 'lyrics');
  }, [compact, view, video]);

  useEffect(() => {
    let cancelled = false;
    setSong(null);
    setLines(null);
    setVideo(null);
    setError(null);
    fetchSong(id)
      .then(async (s) => {
        if (cancelled) return;
        setSong(s);
        setSavedMetronome(defaultMetronome(s));
        setVideo(s.video ?? null);
        setView(s.video || !s.lyricsUrl ? 'video' : 'lyrics');
        if (s.lyricsUrl) {
          const text = await fetchText(s.lyricsUrl);
          if (!cancelled) setLines(parseLrc(text).lines);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    fetchSongs().then(setAllSongs, () => {});
  }, []);

  const { player, load, playing, duration, stems, masterVolume, metronome } = useStemPlayer(song?.stems);

  // Aplica a grade salva da música quando a engine fica pronta.
  useEffect(() => {
    if (player && song) player.updateMetronome(defaultMetronome(song));
  }, [player, song]);

  // Atalhos de teclado
  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') return;
      // Evita que Espaço/Enter também "cliquem" no último botão focado.
      if (target.tagName === 'BUTTON') target.blur();
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyV') {
        setView((v) => (v === 'video' ? 'lyrics' : 'video'));
      } else if (e.code === 'KeyM') {
        player.updateMetronome({ enabled: !player.getSnapshot().metronome.enabled });
      } else if (e.code === 'KeyB') {
        player.alignMetronomeDownbeat();
      } else if (e.code === 'Space') {
        e.preventDefault();
        player.toggle();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        player.skip(-KEY_SKIP_SECONDS);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        player.skip(KEY_SKIP_SECONDS);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player]);

  const idx = allSongs.findIndex((s) => s.id === id);
  const prev = idx > 0 ? allSongs[idx - 1] : undefined;
  const next = idx >= 0 && idx < allSongs.length - 1 ? allSongs[idx + 1] : undefined;

  if (error) {
    return (
      <main className="player-page">
        <Link to="/" className="back">← Músicas</Link>
        <p className="error">{error}</p>
      </main>
    );
  }

  return (
    <main className="player-page">
      <header className="player-header">
        <Link to="/" className="back">← Músicas</Link>
        {song?.coverUrl && <img className="header-cover" src={song.coverUrl} alt="" />}
        {song && (
          <div className="title">
            <h1>{song.title}</h1>
            <span>
              {song.artist}
              {song.key && ` · ${song.key}`}
              {song.bpm && ` · ${song.bpm} BPM`}
            </span>
          </div>
        )}
      </header>

      <div className={`player-body view-${view}`}>
        {load.status === 'loading' ? (
          <div className="loading">
            Carregando stems… {load.total > 0 && `${load.loaded}/${load.total}`}
          </div>
        ) : load.status === 'error' ? (
          <p className="error">{load.message}</p>
        ) : (
          <section className="main-panel">
            <nav className="view-tabs">
              <button className={view === 'video' ? 'on' : ''} onClick={() => setView('video')} title="Atalho: V">
                Vídeo
              </button>
              <button className={view === 'lyrics' ? 'on' : ''} onClick={() => setView('lyrics')} title="Atalho: V">
                Letra
              </button>
              {compact && (
                <button className={view === 'mixer' ? 'on' : ''} onClick={() => setView('mixer')}>
                  Mixer
                </button>
              )}
            </nav>
            {/* O vídeo fica montado (só escondido) para não recarregar nem perder a sincronia. */}
            <div className={`view-pane ${view === 'video' ? '' : 'hidden'}`}>
              <VideoView songId={id} player={player} playing={playing} video={video} onChange={setVideo} />
            </div>
            <div className={`view-pane ${view === 'lyrics' ? '' : 'hidden'}`}>
              <LyricsView player={player} playing={playing} lines={lines} />
            </div>
          </section>
        )}
        <StemMixer player={player} stems={stems} masterVolume={masterVolume}>
          {savedMetronome && (
            <MetronomePanel
              songId={id}
              player={player}
              playing={playing}
              state={metronome}
              saved={savedMetronome}
              onSaved={setSavedMetronome}
            />
          )}
        </StemMixer>
      </div>

      <footer className="player-footer">
        <SeekBar player={player} playing={playing} duration={duration || song?.durationSec || 0} />
        <Transport
          player={player}
          playing={playing}
          onPrevSong={prev && (() => navigate(`/songs/${prev.id}`))}
          onNextSong={next && (() => navigate(`/songs/${next.id}`))}
        />
      </footer>
    </main>
  );
}
