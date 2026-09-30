import type { MetronomeRecord, SongDetail, SongSummary, VideoRecord } from '@backing-tracks/shared';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ao carregar ${url}`);
  return res.json() as Promise<T>;
}

export const fetchSongs = () => getJson<SongSummary[]>('/api/songs');
export const fetchSong = (id: string) => getJson<SongDetail>(`/api/songs/${encodeURIComponent(id)}`);

async function send(method: 'PUT' | 'DELETE', url: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `${res.status} em ${method} ${url}`);
  }
}

export const saveVideo = (id: string, video: VideoRecord) =>
  send('PUT', `/api/songs/${encodeURIComponent(id)}/video`, video);

export const deleteVideo = (id: string) => send('DELETE', `/api/songs/${encodeURIComponent(id)}/video`);

export const saveMetronome = (id: string, body: MetronomeRecord) =>
  send('PUT', `/api/songs/${encodeURIComponent(id)}/metronome`, body);

/** Envia uma música nova (multipart). Usa XHR para reportar o progresso do upload. */
export function uploadSong(form: FormData, onProgress: (fraction: number) => void): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/songs');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const body = xhr.response as { id?: string; error?: string } | null;
      if (xhr.status === 201 && body?.id) resolve({ id: body.id });
      else reject(new Error(body?.error ?? `Falha no envio (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Falha de rede no envio.'));
    xhr.send(form);
  });
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ao carregar ${url}`);
  return res.text();
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Como formatTime, com centésimos: 1:02.35 */
export function formatTimePrecise(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100));
  return `${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
