import type { SongDetail, SongSummary } from '@backing-tracks/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchSong, fetchSongs, fetchText } from '../api';
import { useStemPlayer } from '../audio/useStemPlayer';
import { LyricsView } from '../components/LyricsView';
import { SeekBar } from '../components/SeekBar';
import { StemMixer } from '../components/StemMixer';
import { Transport } from '../components/Transport';
import { parseLrc, type LyricLine } from '../lyrics/parseLrc';

const KEY_SKIP_SECONDS = 5;

export function Player() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [song, setSong] = useState<SongDetail | null>(null);
  const [lines, setLines] = useState<LyricLine[] | null>(null);
  const [allSongs, setAllSongs] = useState<SongSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSong(null);
    setLines(null);
    setError(null);
    fetchSong(id)
      .then(async (s) => {
        if (cancelled) return;
        setSong(s);
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

  const { player, load, playing, duration, stems, masterVolume } = useStemPlayer(song?.stems);

  // Atalhos de teclado
  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') return;
      if (e.code === 'Space') {
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

      <div className="player-body">
        {load.status === 'loading' ? (
          <div className="loading">
            Carregando stems… {load.total > 0 && `${load.loaded}/${load.total}`}
          </div>
        ) : load.status === 'error' ? (
          <p className="error">{load.message}</p>
        ) : (
          <LyricsView player={player} playing={playing} lines={lines} />
        )}
        <StemMixer player={player} stems={stems} masterVolume={masterVolume} />
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
