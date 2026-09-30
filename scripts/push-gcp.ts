/**
 * Envia as músicas de data/songs/ para o Google Cloud:
 *   - arquivos → gs://<bucket>/songs/<id>/<arquivo> (pula os que já existem com o mesmo MD5)
 *   - song.json → Firestore, documento songs/<id>
 *
 * Uso: npm run push-gcp [-- <id> ...] [--force]
 *
 * Vídeo e metrônomo são ajustados pelo app; se já existirem na nuvem, eles têm prioridade
 * sobre o song.json local. --force faz o song.json local sobrescrever tudo.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import type { SongRecord } from '../shared/src/index.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const songsDir = path.join(rootDir, 'data', 'songs');
const project = process.env.GCP_PROJECT ?? 'backing-tracks-510200';
const bucketName = process.env.GCS_BUCKET ?? 'backing-tracks-510200-media';
/** Campos que o app edita na nuvem. */
const CLOUD_OWNED = ['video', 'metronome'] as const;

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.lrc': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const md5 = (file: string) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('base64');

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = args.filter((a) => !a.startsWith('--'));

  const firestore = new Firestore({ projectId: project, ignoreUndefinedProperties: true });
  const bucket = new Storage({ projectId: project }).bucket(bucketName);
  const ids = fs
    .readdirSync(songsDir)
    .filter((id) => fs.existsSync(path.join(songsDir, id, 'song.json')))
    .filter((id) => only.length === 0 || only.includes(id));
  if (ids.length === 0) throw new Error('Nenhuma música encontrada em data/songs/.');

  for (const id of ids) {
    const dir = path.join(songsDir, id);
    const song = JSON.parse(fs.readFileSync(path.join(dir, 'song.json'), 'utf8')) as SongRecord;
    const files = [...song.stems.map((s) => s.file), song.lyricsFile, song.coverFile].filter(
      (f): f is string => Boolean(f),
    );

    let sent = 0;
    let skipped = 0;
    for (const file of files) {
      const local = path.join(dir, file);
      const remote = bucket.file(`songs/${id}/${file}`);
      const [exists] = await remote.exists();
      if (exists) {
        const [meta] = await remote.getMetadata();
        if (meta.md5Hash === md5(local)) {
          skipped++;
          continue;
        }
      }
      await bucket.upload(local, {
        destination: `songs/${id}/${file}`,
        resumable: fs.statSync(local).size > 8 * 1024 * 1024,
        metadata: {
          contentType: CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
          cacheControl: 'private, max-age=86400',
        },
      });
      sent++;
    }

    const ref = firestore.collection('songs').doc(id);
    const current = (await ref.get()).data() as Partial<SongRecord> | undefined;
    const doc: SongRecord = { ...song, id };
    if (current && !force) {
      for (const k of CLOUD_OWNED) if (current[k] !== undefined) (doc as unknown as Record<string, unknown>)[k] = current[k];
    }
    await ref.set(doc);

    const kept = current && !force ? CLOUD_OWNED.filter((k) => current[k] !== undefined) : [];
    console.log(
      `✓ ${song.artist} - ${song.title}: ${sent} enviado(s), ${skipped} já no bucket; Firestore songs/${id}` +
        (kept.length ? ` (mantido da nuvem: ${kept.join(', ')})` : ''),
    );
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
