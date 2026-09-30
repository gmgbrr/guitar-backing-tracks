import type { MetronomeRecord, SongDetail, SongSummary, UploadField, UploadRequest, UploadSession, VideoRecord } from '@backing-tracks/shared';

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

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Falha (${res.status})`);
  return data;
}

/** PUT de um arquivo com progresso (XHR: fetch não informa progresso de envio). */
function putFile(url: string, headers: Record<string, string>, file: File, onBytes: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Falha ao enviar ${file.name} (${xhr.status})`)));
    xhr.onerror = () => reject(new Error(`Falha de rede ao enviar ${file.name}.`));
    xhr.send(file);
  });
}

/**
 * Envia uma música nova em 3 etapas: pede links de envio à API, envia cada arquivo direto
 * para o armazenamento e pede à API para validar e criar a música.
 */
export async function uploadSong(
  meta: Omit<UploadRequest, 'files'>,
  files: { field: UploadField; file: File }[],
  onProgress: (fraction: number, stage: 'sending' | 'validating') => void,
): Promise<{ id: string }> {
  const request: UploadRequest = { ...meta, files: files.map((f) => ({ field: f.field, size: f.file.size })) };
  const session = await postJson<UploadSession>('/api/uploads', request);

  const total = files.reduce((n, f) => n + f.file.size, 0);
  const loaded = new Map<UploadField, number>();
  const report = () => onProgress([...loaded.values()].reduce((a, b) => a + b, 0) / total, 'sending');
  for (const target of session.targets) {
    const f = files.find((x) => x.field === target.field)!;
    await putFile(target.url, target.headers, f.file, (bytes) => {
      loaded.set(target.field, bytes);
      report();
    });
    loaded.set(target.field, f.file.size);
    report();
  }

  onProgress(1, 'validating');
  return postJson<{ id: string }>(`/api/uploads/${session.uploadId}/complete`, request);
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
