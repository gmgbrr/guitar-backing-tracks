import type { SongDetail, SongSummary } from '@backing-tracks/shared';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ao carregar ${url}`);
  return res.json() as Promise<T>;
}

export const fetchSongs = () => getJson<SongSummary[]>('/api/songs');
export const fetchSong = (id: string) => getJson<SongDetail>(`/api/songs/${encodeURIComponent(id)}`);

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ao carregar ${url}`);
  return res.text();
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
