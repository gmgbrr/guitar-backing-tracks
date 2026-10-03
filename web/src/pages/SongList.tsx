import { isStandardTuning, tuningLabel, type SongSummary } from '@backing-tracks/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSongs, formatTime } from '../api';

export function SongList() {
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchSongs().then(setSongs, (e: Error) => setError(e.message));
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = songs?.filter((s) => `${s.artist} ${s.title}`.toLowerCase().includes(q));

  return (
    <main className="list-page">
      <header className="list-header">
        <h1>Backing Tracks</h1>
        <Link to="/upload" className="add-song">
          + Adicionar música
        </Link>
        <input
          type="search"
          placeholder="Buscar música ou artista…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      {error && <p className="error">Erro ao carregar músicas: {error}</p>}
      {!songs && !error && <p className="muted">Carregando…</p>}
      {songs?.length === 0 && (
        <p className="muted">
          Nenhuma música ainda. <Link to="/upload">Adicione a primeira</Link>.
        </p>
      )}

      <ul className="song-list">
        {filtered?.map((s) => (
          <li key={s.id}>
            <Link to={`/songs/${s.id}`}>
              <div className="cover" aria-hidden>
                {s.coverUrl ? <img src={s.coverUrl} alt="" loading="lazy" /> : s.title.charAt(0)}
              </div>
              <div className="info">
                <strong>{s.title}</strong>
                <span>{s.artist}</span>
              </div>
              <div className="tags">
                {s.key && <span className="tag">{s.key}</span>}
                {s.bpm && <span className="tag">{s.bpm} BPM</span>}
                {!isStandardTuning(s.tuning) && <span className="tag tuning-tag">{tuningLabel(s.tuning)}</span>}
                <span className="tag">{s.stemNames.length} stems</span>
                {s.hasLyrics && <span className="tag">letra</span>}
              </div>
              <span className="duration">{formatTime(s.durationSec)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
