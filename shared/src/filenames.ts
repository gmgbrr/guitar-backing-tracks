/**
 * Leitura de nomes de arquivos de stems/letras/capas, compartilhada entre o importador,
 * a API (geração do id) e a tela de upload (preenchimento automático).
 */

export const STEM_NAMES = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'] as const;
export type StemName = (typeof STEM_NAMES)[number];

export const STEM_LABELS: Record<StemName, string> = {
  vocals: 'Voz',
  drums: 'Bateria',
  bass: 'Baixo',
  guitar: 'Guitarra',
  piano: 'Piano',
  other: 'Outros',
};

/** Limites de upload, validados no navegador (aviso cedo) e no servidor (garantia). */
export const UPLOAD_LIMITS = {
  stemMaxBytes: 40 * 1024 * 1024,
  lyricsMaxBytes: 200 * 1024,
  coverMaxBytes: 5 * 1024 * 1024,
  maxStems: STEM_NAMES.length,
  textMaxLength: 120,
  minDurationSec: 5,
  maxDurationSec: 30 * 60,
} as const;

/** Campos de arquivo de um upload: um por stem, letra e capa. */
export const UPLOAD_FIELDS = [...STEM_NAMES.map((s) => `stem_${s}` as const), 'lyrics', 'cover'] as const;
export type UploadField = (typeof UPLOAD_FIELDS)[number];

export const isUploadField = (v: unknown): v is UploadField =>
  typeof v === 'string' && (UPLOAD_FIELDS as readonly string[]).includes(v);

/** Tamanho máximo aceito para cada campo. */
export function maxBytesFor(field: UploadField): number {
  if (field === 'lyrics') return UPLOAD_LIMITS.lyricsMaxBytes;
  if (field === 'cover') return UPLOAD_LIMITS.coverMaxBytes;
  return UPLOAD_LIMITS.stemMaxBytes;
}

/** Pedido de upload: dados da música + quais arquivos serão enviados (conteúdo vai direto ao armazenamento). */
export interface UploadRequest {
  artist: string;
  title: string;
  key?: string;
  bpm?: number | string;
  youtubeId?: string;
  files: { field: UploadField; size: number }[];
}

/** Resposta de POST /api/uploads: onde enviar cada arquivo (PUT). */
export interface UploadSession {
  uploadId: string;
  targets: { field: UploadField; url: string; headers: Record<string, string> }[];
}

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'ogg', 'm4a'] as const;
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Id de uma música a partir de artista e título (o mesmo usado pelo importador). */
export const songId = (artist: string, title: string) => slugify(`${artist} ${title}`);

/** Trechos " - <x>" que indicam versão/qualidade, não fazem parte do título. */
const VERSION_SUFFIX =
  /^(?:(?:\d{4} )?remaster(?:ed)?(?: \d{4})?(?: version)?|live.*|radio edit|single version|album version|mono|stereo|explicit|official (?:audio|video)|\d+ ?kbps)$/i;

export function parseArtistTitle(prefix: string): { artist: string; title: string } {
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

const STEM_RE = new RegExp(
  `^(?<prefix>.+)-(?<stem>${STEM_NAMES.join('|')})-(?<key>[A-G][#b]? (?:major|minor))-(?<bpm>\\d+)bpm-\\d+hz\\.(?<ext>${AUDIO_EXTENSIONS.join('|')})$`,
  'i',
);

export interface StemFileInfo {
  artist: string;
  title: string;
  stem: StemName;
  key: string;
  bpm: number;
  ext: string;
}

/** "<Artista> - <Título>[...]-<stem>-<tom>-<bpm>bpm-<hz>hz.mp3" → dados; null se não seguir o padrão. */
export function parseStemFilename(name: string): StemFileInfo | null {
  const m = STEM_RE.exec(name);
  if (!m?.groups) return null;
  const { artist, title } = parseArtistTitle(m.groups.prefix);
  return {
    artist,
    title,
    stem: m.groups.stem.toLowerCase() as StemName,
    key: m.groups.key,
    bpm: Number(m.groups.bpm),
    ext: m.groups.ext.toLowerCase(),
  };
}

/** Palavras que indicam cada stem em nomes livres (inglês e português). */
const STEM_KEYWORDS: Record<StemName, RegExp> = {
  vocals: /\b(vocals?|voice|voz|vocal)\b/i,
  drums: /\b(drums?|bateria|percussion)\b/i,
  bass: /\b(bass|baixo)\b/i,
  guitar: /\b(guitars?|guitarra|violao|violão)\b/i,
  piano: /\b(piano|keys|teclado)\b/i,
  other: /\b(other|outros|instrumental|accompaniment)\b/i,
};

export type FileRole = { kind: 'stem'; stem: StemName } | { kind: 'lyrics' } | { kind: 'cover' } | { kind: 'ignore' };

const extOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

/** Palpite do papel de um arquivo pelo nome (a tela de upload deixa o usuário corrigir). */
export function guessFileRole(name: string): FileRole {
  const ext = extOf(name);
  if (ext === 'lrc') return { kind: 'lyrics' };
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return { kind: 'cover' };
  if (!(AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return { kind: 'ignore' };
  const parsed = parseStemFilename(name);
  if (parsed) return { kind: 'stem', stem: parsed.stem };
  const base = name.slice(0, name.lastIndexOf('.')).replace(/[_\-.]+/g, ' ');
  for (const stem of STEM_NAMES) if (STEM_KEYWORDS[stem].test(base)) return { kind: 'stem', stem };
  return { kind: 'ignore' }; // áudio sem stem reconhecível (ex.: mix completo)
}
