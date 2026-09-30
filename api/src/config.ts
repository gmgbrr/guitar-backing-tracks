import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const config = {
  port: Number(process.env.PORT ?? 3001),
  /** 'local' hoje; 'gcp' quando existirem FirestoreSongRepository + GcsMediaStorage. */
  storageDriver: process.env.STORAGE_DRIVER ?? 'local',
  dataDir: path.resolve(rootDir, process.env.DATA_DIR ?? 'data'),
  /** Build do frontend, servido pela API em produção (um único container no Cloud Run). */
  webDistDir: path.resolve(rootDir, 'web/dist'),
};
