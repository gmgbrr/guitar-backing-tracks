/**
 * Organiza stems + .lrc soltos em data/songs/<slug>/ e gera song.json.
 *
 * Uso: npm run import -- <pasta> [<pasta> ...]
 *
 * Nome esperado dos stems:  "<Artista> - <Título>[ qualquer coisa]-<stem>-<tom>-<bpm>bpm-<hz>hz.mp3"
 * Letra (opcional):         "<Artista> - <Título>.lrc"
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

function parseArtistTitle(prefix: string): { artist: string; title: string } {
  const [artist, ...rest] = prefix.split(' - ');
  // remove sufixos comuns: "(Official Audio)", "- (320 Kbps)" etc.
  const title = rest.join(' - ').replace(/\s*[-–]?\s*\([^)]*\)/g, '').trim();
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

for (const dir of dirs) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name.toLowerCase().endsWith('.lrc')) {
      const { artist, title } = parseArtistTitle(name.slice(0, -4));
      lrcFiles.set(slugify(`${artist} ${title}`), full);
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

  const record: SongRecord = {
    id: slug,
    title: g.title,
    artist: g.artist,
    key: g.key,
    bpm: g.bpm,
    durationSec: probeDuration(g.stems[0].src),
    stems,
    lyricsFile,
  };
  fs.writeFileSync(path.join(dest, 'song.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(`✓ ${g.artist} - ${g.title} → data/songs/${slug} (${stems.length} stems${lyricsFile ? ', letra' : ''})`);
}
