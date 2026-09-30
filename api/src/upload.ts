import { parseBuffer } from 'music-metadata';
import { songId, STEM_LABELS, STEM_NAMES, UPLOAD_LIMITS, type SongRecord, type StemName } from '@backing-tracks/shared';
import { HttpError } from './security.js';
import { isValidSongId } from './repositories/SongRepository.js';

export interface IncomingFile {
  buffer: Buffer;
  size: number;
  originalname: string;
}

/** Arquivos por campo do formulário multipart (formato do multer .fields()). */
export type IncomingFiles = Partial<Record<string, IncomingFile[]>>;

export interface ValidatedUpload {
  record: SongRecord;
  /** Arquivos a gravar, com nome e tipo definidos pelo servidor. */
  files: { name: string; data: Buffer; contentType: string }[];
}

/** Campos de arquivo aceitos no multipart; qualquer outro é rejeitado pelo multer. */
export const UPLOAD_FILE_FIELDS = [
  ...STEM_NAMES.map((s) => ({ name: `stem_${s}`, maxCount: 1 })),
  { name: 'lyrics', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
];

const bad = (msg: string) => new HttpError(400, msg);

// ---------- texto ----------

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/;

export function cleanText(value: unknown, field: string, required: boolean): string | undefined {
  if (value === undefined || value === '') {
    if (required) throw bad(`${field} é obrigatório.`);
    return undefined;
  }
  if (typeof value !== 'string') throw bad(`${field} inválido.`);
  const text = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!text) {
    if (required) throw bad(`${field} é obrigatório.`);
    return undefined;
  }
  if (CONTROL_CHARS.test(text)) throw bad(`${field} contém caracteres inválidos.`);
  if (text.length > UPLOAD_LIMITS.textMaxLength) throw bad(`${field} deve ter até ${UPLOAD_LIMITS.textMaxLength} caracteres.`);
  return text;
}

const KEY_RE = /^[A-G][#b]?(?: (?:major|minor))?$/;

// ---------- arquivos ----------

interface AudioInfo {
  ext: string;
  contentType: string;
  duration: number;
}

/** Formato real do áudio pelo conteúdo (container detectado), não pelo nome/extensão enviados. */
const AUDIO_CONTAINERS: { match: RegExp; ext: string; contentType: string }[] = [
  { match: /^MPEG$/i, ext: 'mp3', contentType: 'audio/mpeg' },
  { match: /^WAVE$/i, ext: 'wav', contentType: 'audio/wav' },
  { match: /^FLAC$/i, ext: 'flac', contentType: 'audio/flac' },
  { match: /^Ogg$/i, ext: 'ogg', contentType: 'audio/ogg' },
  { match: /^(M4A|MP4|isom|iso2|mp42)\b/i, ext: 'm4a', contentType: 'audio/mp4' },
];

export async function inspectAudio(data: Buffer, label: string): Promise<AudioInfo> {
  let meta;
  try {
    meta = await parseBuffer(data, undefined, { duration: true, skipCovers: true, skipPostHeaders: true });
  } catch {
    throw bad(`${label}: não é um arquivo de áudio válido.`);
  }
  const container = meta.format.container ?? '';
  const kind = AUDIO_CONTAINERS.find((c) => c.match.test(container));
  if (!kind || (!meta.format.codec && !meta.format.sampleRate)) throw bad(`${label}: formato de áudio não suportado.`);
  const duration = meta.format.duration ?? 0;
  if (!Number.isFinite(duration) || duration < UPLOAD_LIMITS.minDurationSec || duration > UPLOAD_LIMITS.maxDurationSec) {
    throw bad(`${label}: duração inválida (${Math.round(duration)} s).`);
  }
  return { ext: kind.ext, contentType: kind.contentType, duration: Math.round(duration * 100) / 100 };
}

/** Assinaturas de arquivo (magic bytes) das imagens aceitas. */
export function detectImage(data: Buffer): { ext: string; contentType: string } | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { ext: 'jpg', contentType: 'image/jpeg' };
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}

/** Letra LRC: UTF-8 válido, sem bytes nulos e com pelo menos um tempo [mm:ss]. */
export function validateLyrics(data: Buffer): Buffer {
  if (data.length > UPLOAD_LIMITS.lyricsMaxBytes) throw bad('Letra: arquivo grande demais.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw bad('Letra: o arquivo precisa estar em UTF-8.');
  }
  text = text.replace(/^﻿/, '');
  if (text.includes('\u0000')) throw bad('Letra: arquivo inválido.');
  if (!/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/.test(text)) throw bad('Letra: nenhum tempo [mm:ss] encontrado; envie um arquivo .lrc sincronizado.');
  return Buffer.from(text, 'utf8');
}

// ---------- montagem ----------

/**
 * Valida campos e arquivos do upload e monta o registro da música.
 * Tudo que vai para o banco/bucket (id, nomes, tipos, duração) é derivado aqui no servidor.
 */
export async function validateUpload(body: Record<string, unknown>, files: IncomingFiles): Promise<ValidatedUpload> {
  const artist = cleanText(body.artist, 'Artista', true)!;
  const title = cleanText(body.title, 'Título', true)!;

  const key = cleanText(body.key, 'Tom', false);
  if (key && !KEY_RE.test(key)) throw bad('Tom inválido (ex.: E minor, F# major, Bb).');

  let bpm: number | undefined;
  if (body.bpm !== undefined && body.bpm !== '') {
    bpm = Number(body.bpm);
    if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) throw bad('BPM deve estar entre 20 e 300.');
    bpm = Math.round(bpm * 10) / 10;
  }

  let youtubeId: string | undefined;
  if (body.youtubeId !== undefined && body.youtubeId !== '') {
    if (typeof body.youtubeId !== 'string' || !/^[\w-]{11}$/.test(body.youtubeId)) throw bad('Link do YouTube inválido.');
    youtubeId = body.youtubeId;
  }

  const id = songId(artist, title);
  if (!isValidSongId(id)) throw bad('Artista e título precisam conter letras ou números.');

  const out: ValidatedUpload['files'] = [];
  const stems: SongRecord['stems'] = [];
  const durations: number[] = [];
  for (const stem of STEM_NAMES) {
    const file = files[`stem_${stem}`]?.[0];
    if (!file) continue;
    if (file.size > UPLOAD_LIMITS.stemMaxBytes) throw bad(`${stemLabel(stem)}: arquivo grande demais.`);
    const info = await inspectAudio(file.buffer, stemLabel(stem));
    const name = `${stem}.${info.ext}`;
    out.push({ name, data: file.buffer, contentType: info.contentType });
    stems.push({ name: stem, file: name });
    durations.push(info.duration);
  }
  if (stems.length === 0) throw bad('Envie pelo menos um stem de áudio.');
  const durationSec = Math.max(...durations);
  if (durationSec - Math.min(...durations) > 3) {
    throw bad('Os stems têm durações diferentes (mais de 3 s); confira se são da mesma música.');
  }

  let lyricsFile: string | undefined;
  const lyrics = files.lyrics?.[0];
  if (lyrics) {
    out.push({ name: 'lyrics.lrc', data: validateLyrics(lyrics.buffer), contentType: 'text/plain; charset=utf-8' });
    lyricsFile = 'lyrics.lrc';
  }

  let coverFile: string | undefined;
  const cover = files.cover?.[0];
  if (cover) {
    if (cover.size > UPLOAD_LIMITS.coverMaxBytes) throw bad('Capa: imagem grande demais.');
    const img = detectImage(cover.buffer);
    if (!img) throw bad('Capa: envie uma imagem JPG, PNG ou WebP.');
    coverFile = `cover.${img.ext}`;
    out.push({ name: coverFile, data: cover.buffer, contentType: img.contentType });
  }

  const record: SongRecord = {
    id,
    title,
    artist,
    key,
    bpm,
    durationSec,
    stems,
    lyricsFile,
    coverFile,
    video: youtubeId ? { youtubeId, offsetSec: 0 } : undefined,
  };
  // remove campos vazios (o Firestore não aceita undefined e o JSON fica mais limpo)
  for (const k of Object.keys(record) as (keyof SongRecord)[]) if (record[k] === undefined) delete record[k];
  return { record, files: out };
}

const stemLabel = (s: StemName) => STEM_LABELS[s];
