/**
 * Organiza stems + .lrc soltos em data/songs/<slug>/ e gera song.json.
 *
 * Uso: npm run import -- <pasta> [<pasta> ...]
 *
 * Nome esperado dos stems:  "<Artista> - <Título>[ qualquer coisa]-<stem>-<tom>-<bpm>bpm-<hz>hz.mp3"
 * Letra (opcional):         "<Artista> - <Título>.lrc"
 * Capa (opcional):          "<Artista> - <Título>.jpg", "<Título>-cover.jpg" ou "<Artista> - <Título>-cover.jpg"
 *                           (jpg, png ou webp)
 *
 * Reimportar uma música preserva o que foi configurado no app (vídeo, metrônomo) e a capa já existente.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SongRecord } from '../shared/src/index.js';
import { parseArtistTitle, parseStemFilename, slugify, STEM_NAMES } from '../shared/src/filenames.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const songsDir = path.join(rootDir, 'data', 'songs');
const STEM_ORDER: readonly string[] = STEM_NAMES;

interface Group {
  artist: string;
  title: string;
  key?: string;
  bpm?: number;
  stems: { name: string; src: string; ext: string }[];
}

function probeDuration(file: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Math.round(parseFloat(out.toString()) * 100) / 100;
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) dirs.push(rootDir);

const groups = new Map<string, Group>();
const lrcFiles = new Map<string, string>(); // slug -> caminho
const coverFiles = new Map<string, string>(); // slug do nome (sem "-cover") -> caminho
const COVER_RE = /^(?<base>.+?)(?:[-_ ]cover)?\.(?<ext>jpe?g|png|webp)$/i;

for (const dir of dirs) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name.toLowerCase().endsWith('.lrc')) {
      const { artist, title } = parseArtistTitle(name.slice(0, -4));
      lrcFiles.set(slugify(`${artist} ${title}`), full);
      continue;
    }
    const cover = COVER_RE.exec(name);
    if (cover?.groups) {
      const { artist, title } = parseArtistTitle(cover.groups.base);
      coverFiles.set(slugify(`${artist} ${title}`), full); // "<Artista> - <Título>"
      coverFiles.set(slugify(cover.groups.base), full); // "<Título>" sozinho
      continue;
    }
    const info = parseStemFilename(name);
    if (!info) continue;
    const slug = slugify(`${info.artist} ${info.title}`);
    const g = groups.get(slug) ?? { artist: info.artist, title: info.title, key: info.key, bpm: info.bpm, stems: [] };
    g.stems.push({ name: info.stem, src: full, ext: info.ext });
    groups.set(slug, g);
  }
}

if (groups.size === 0) {
  console.error('Nenhum stem encontrado. Verifique o padrão do nome dos arquivos.');
  process.exit(1);
}

for (const [slug, g] of groups) {
  const dest = path.join(songsDir, slug);
  fs.mkdirSync(dest, { recursive: true });
  g.stems.sort((a, b) => STEM_ORDER.indexOf(a.name) - STEM_ORDER.indexOf(b.name));

  const stems = g.stems.map((s) => {
    const file = `${s.name}.${s.ext}`;
    fs.copyFileSync(s.src, path.join(dest, file));
    return { name: s.name, file };
  });

  let lyricsFile: string | undefined;
  const lrc = lrcFiles.get(slug);
  if (lrc) {
    lyricsFile = 'lyrics.lrc';
    fs.copyFileSync(lrc, path.join(dest, lyricsFile));
  }

  const songFile = path.join(dest, 'song.json');
  const existing: Partial<SongRecord> = fs.existsSync(songFile) ? JSON.parse(fs.readFileSync(songFile, 'utf8')) : {};

  let coverFile = existing.coverFile;
  const cover = coverFiles.get(slug) ?? coverFiles.get(slugify(g.title));
  if (cover) {
    if (coverFile) fs.rmSync(path.join(dest, coverFile), { force: true });
    coverFile = `cover${path.extname(cover).toLowerCase().replace('.jpeg', '.jpg')}`;
    fs.copyFileSync(cover, path.join(dest, coverFile));
  }

  const record: SongRecord = {
    ...existing, // preserva vídeo, metrônomo etc. configurados no app
    id: slug,
    title: g.title,
    artist: g.artist,
    key: g.key,
    bpm: g.bpm,
    durationSec: probeDuration(g.stems[0].src),
    stems,
    lyricsFile: lyricsFile ?? existing.lyricsFile,
    coverFile,
  };
  fs.writeFileSync(songFile, JSON.stringify(record, null, 2) + '\n');
  const extras = [lyricsFile && 'letra', cover && 'capa'].filter(Boolean).join(', ');
  console.log(`✓ ${g.artist} - ${g.title} → data/songs/${slug} (${stems.length} stems${extras ? `, ${extras}` : ''})`);
}
