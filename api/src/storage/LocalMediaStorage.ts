import type { MediaStorage } from './MediaStorage.js';

export class LocalMediaStorage implements MediaStorage {
  async getUrl(songId: string, file: string): Promise<string> {
    return `/media/${encodeURIComponent(songId)}/${encodeURIComponent(file)}`;
  }
}
