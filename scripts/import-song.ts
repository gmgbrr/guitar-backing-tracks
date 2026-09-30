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

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const songsDir = path.join(rootDir, 'data', 'songs');
const STEM_ORDER = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];
const STEM_RE = /^(?<prefix>.+)-(?<stem>vocals|drums|bass|guitar|piano|other)-(?<key>[A-G][#b]? (?:major|minor))-(?<bpm>\d+)bpm-\d+hz\.(?<ext>mp3|wav|flac|ogg|m4a)$/i;

interface Group {
  artist: string;
  title: string;
  key?: string;
  bpm?: number;
  stems: { name: string; src: string; ext: string }[];
}

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Trechos " - <x>" que indicam versão/qualidade, não fazem parte do título. */
const VERSION_SUFFIX = /^(?:(?:\d{4} )?remaster(?:ed)?(?: \d{4})?(?: version)?|live.*|radio edit|single version|album version|mono|stereo|explicit|official (?:audio|video)|\d+ ?kbps)$/i;

function parseArtistTitle(prefix: string): { artist: string; title: string } {
  const [artist, ...rest] = prefix.split(' - ');
  // remove parênteses ("(Official Audio)", "(320 Kbps)", "(1)") e sufixos de versão ("- Remastered")
  const title = rest
    .join(' - ')
    .replace(/\s*\([^)]*\)/g, '')
    .split(/\s[-–](?:\s|$)/) // " - " no meio ou " -" solto no fim; hífens dentro de palavras ficam
    .map((part) => part.trim())
    .filter((part) => part && !VERSION_SUFFIX.test(part))
    .join(' - ');
  return { artist: artist.trim(), title: title || artist.trim() };
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
    const m = STEM_RE.exec(name);
    if (!m?.groups) continue;
    const { artist, title } = parseArtistTitle(m.groups.prefix);
    const slug = slugify(`${artist} ${title}`);
    const g = groups.get(slug) ?? { artist, title, key: m.groups.key, bpm: Number(m.groups.bpm), stems: [] };
    g.stems.push({ name: m.groups.stem.toLowerCase(), src: full, ext: m.groups.ext.toLowerCase() });
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
