import {
  guessFileRole,
  parseArtistTitle,
  parseStemFilename,
  STEM_LABELS,
  STEM_NAMES,
  UPLOAD_LIMITS,
  type FileRole,
  type UploadField,
} from '@backing-tracks/shared';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { uploadSong } from '../api';
import { parseYouTubeId } from '../video/youtube';

interface PickedFile {
  key: number;
  file: File;
  role: FileRole;
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
  ...STEM_NAMES.map((s) => ({ value: `stem:${s}`, label: `Stem: ${STEM_LABELS[s]}` })),
  { value: 'lyrics', label: 'Letra (.lrc)' },
  { value: 'cover', label: 'Capa' },
  { value: 'ignore', label: 'Ignorar' },
];

const roleValue = (r: FileRole) => (r.kind === 'stem' ? `stem:${r.stem}` : r.kind);
const roleFromValue = (v: string): FileRole =>
  v.startsWith('stem:') ? { kind: 'stem', stem: v.slice(5) as (typeof STEM_NAMES)[number] } : ({ kind: v } as FileRole);

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Limite de tamanho por papel do arquivo (o servidor valida de novo). */
function sizeError(p: PickedFile): string | null {
  const max =
    p.role.kind === 'stem' ? UPLOAD_LIMITS.stemMaxBytes
    : p.role.kind === 'lyrics' ? UPLOAD_LIMITS.lyricsMaxBytes
    : p.role.kind === 'cover' ? UPLOAD_LIMITS.coverMaxBytes
    : Infinity;
  return p.file.size > max ? `maior que ${mb(max)}` : null;
}

export function UploadSong() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [musicKey, setMusicKey] = useState('');
  const [bpm, setBpm] = useState('');
  const [youtube, setYoutube] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setError(null);

    // Preenche o formulário a partir do padrão de nome dos stems/letra, sem sobrescrever o que já foi digitado.
    for (const f of list) {
      const info = parseStemFilename(f.name);
      const fromLrc = f.name.toLowerCase().endsWith('.lrc') && f.name.includes(' - ')
        ? parseArtistTitle(f.name.slice(0, -4))
        : null;
      const src = info ?? fromLrc;
      if (src) {
        setArtist((v) => v || src.artist);
        setTitle((v) => v || src.title);
      }
      if (info) {
        setMusicKey((v) => v || info.key);
        setBpm((v) => v || String(info.bpm));
      }
    }

    setPicked((prev) => {
      const next = [...prev];
      for (const file of list) {
        if (next.some((p) => p.file.name === file.name && p.file.size === file.size)) continue; // duplicado
        let role = guessFileRole(file.name);
        // Um arquivo por papel: se já houver, o novo entra como "ignorar" para o usuário decidir.
        if (role.kind !== 'ignore' && next.some((p) => roleValue(p.role) === roleValue(role))) role = { kind: 'ignore' };
        next.push({ key: nextKey.current++, file, role });
      }
      return next;
    });
  };

  const setRole = (key: number, value: string) =>
    setPicked((prev) => {
      const role = roleFromValue(value);
      // Trocar para um papel já usado libera o arquivo anterior (vira "ignorar").
      return prev.map((p) =>
        p.key === key ? { ...p, role } : role.kind !== 'ignore' && roleValue(p.role) === value ? { ...p, role: { kind: 'ignore' } } : p,
      );
    });

  const remove = (key: number) => setPicked((prev) => prev.filter((p) => p.key !== key));

  const used = picked.filter((p) => p.role.kind !== 'ignore');
  const stems = used.filter((p) => p.role.kind === 'stem');
  const youtubeId = youtube.trim() ? parseYouTubeId(youtube) : null;
  const problems = [
    !artist.trim() && 'Informe o artista.',
    !title.trim() && 'Informe o título.',
    stems.length === 0 && 'Adicione pelo menos um stem de áudio.',
    youtube.trim() && !youtubeId && 'Link do YouTube inválido.',
    ...used.map((p) => sizeError(p) && `${p.file.name}: ${sizeError(p)}.`),
  ].filter(Boolean) as string[];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problems.length > 0 || progress !== null) return;
    const meta = {
      artist: artist.trim(),
      title: title.trim(),
      key: musicKey.trim() || undefined,
      bpm: bpm.trim() || undefined,
      youtubeId: youtubeId ?? undefined,
    };
    const files = used.map((p) => ({
      field: (p.role.kind === 'stem' ? `stem_${p.role.stem}` : p.role.kind) as UploadField,
      file: p.file,
    }));
    setError(null);
    setProgress(0);
    try {
      const { id } = await uploadSong(meta, files, (fraction) => setProgress(fraction));
      navigate(`/songs/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setProgress(null);
    }
  };

  const sending = progress !== null;

  return (
    <main className="upload-page">
      <header className="upload-header">
        <Link to="/" className="back">
          ← Músicas
        </Link>
        <h1>Adicionar música</h1>
      </header>

      <form onSubmit={submit} className="upload-form">
        <div
          className={`dropzone ${dragging ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        >
          <strong>Arraste os arquivos aqui</strong>
          <span className="muted">ou clique para escolher · stems de áudio, letra .lrc e capa (jpg/png/webp)</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.lrc,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {picked.length > 0 && (
          <table className="upload-files">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Tamanho</th>
                <th>Usar como</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {picked.map((p) => {
                const err = p.role.kind !== 'ignore' ? sizeError(p) : null;
                return (
                  <tr key={p.key} className={p.role.kind === 'ignore' ? 'ignored' : err ? 'bad' : ''}>
                    <td className="name" title={p.file.name}>
                      {p.file.name}
                    </td>
                    <td className="size">{mb(p.file.size)}</td>
                    <td>
                      <select value={roleValue(p.role)} onChange={(e) => setRole(p.key, e.target.value)} disabled={sending}>
                        {ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="icon" onClick={() => remove(p.key)} disabled={sending} aria-label="Remover">
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="upload-fields">
          <label>
            Artista *
            <input value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={UPLOAD_LIMITS.textMaxLength} required />
          </label>
          <label>
            Título *
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={UPLOAD_LIMITS.textMaxLength} required />
          </label>
          <label>
            Tom
            <input value={musicKey} onChange={(e) => setMusicKey(e.target.value)} placeholder="ex.: E minor" maxLength={20} />
          </label>
          <label>
            BPM
            <input type="number" min={20} max={300} step="0.1" value={bpm} onChange={(e) => setBpm(e.target.value)} />
          </label>
          <label className="wide">
            Vídeo do YouTube (opcional)
            <input type="url" value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
          </label>
        </div>

        {(error || (problems.length > 0 && picked.length > 0)) && (
          <ul className="upload-problems">
            {error && <li className="error">{error}</li>}
            {!error && problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}

        <div className="upload-actions">
          {sending && (
            <div className="upload-progress" aria-label="Progresso do envio">
              <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
              <em>{progress! < 1 ? `Enviando… ${Math.round(progress! * 100)}%` : 'Validando e salvando…'}</em>
            </div>
          )}
          <button className="primary" disabled={problems.length > 0 || sending}>
            {sending ? 'Enviando…' : 'Enviar música'}
          </button>
        </div>
      </form>
    </main>
  );
}
