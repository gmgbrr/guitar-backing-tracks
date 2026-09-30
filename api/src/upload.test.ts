import { describe, expect, it } from 'vitest';
import { cleanText, detectImage, validateFileList, validateLyrics, validateUpload, type IncomingFiles } from './upload';

/** WAV PCM mono 8 kHz 8-bit de silêncio com a duração pedida. */
function wav(seconds: number): Buffer {
  const rate = 8000;
  const dataLen = Math.round(rate * seconds);
  const b = Buffer.alloc(44 + dataLen, 0x80);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + dataLen, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(dataLen, 40);
  return b;
}

const file = (buffer: Buffer, _originalname = 'x') => buffer;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const LRC = Buffer.from('[ar: Teste]\n[00:01.00]primeira linha\n[00:03.50]segunda linha\n', 'utf8');

describe('cleanText', () => {
  it('normaliza espaços', () => expect(cleanText('  Minha   Banda ', 'Artista', true)).toBe('Minha Banda'));
  it('rejeita caracteres de controle e texto invisível bidirecional', () => {
    expect(() => cleanText('abc\u0000', 'Artista', true)).toThrow(/inválidos/);
    expect(() => cleanText('abc‮def', 'Artista', true)).toThrow(/inválidos/);
  });
  it('rejeita texto longo demais e tipos errados', () => {
    expect(() => cleanText('a'.repeat(121), 'Título', true)).toThrow(/120/);
    expect(() => cleanText(['a'], 'Título', true)).toThrow(/inválido/);
  });
  it('obrigatório vazio', () => expect(() => cleanText('   ', 'Título', true)).toThrow(/obrigatório/));
});

describe('detectImage', () => {
  it('reconhece pela assinatura, não pelo nome', () => {
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    expect(detectImage(PNG)?.ext).toBe('png');
    expect(detectImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary'))?.ext).toBe('webp');
    expect(detectImage(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(detectImage(Buffer.from('MZ\x90\x00'))).toBeNull(); // executável
  });
});

describe('validateLyrics', () => {
  it('aceita LRC em UTF-8 (com BOM)', () => {
    expect(validateLyrics(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), LRC])).toString('utf8').startsWith('[ar:')).toBe(true);
  });
  it('rejeita texto sem tempos, binário e encoding inválido', () => {
    expect(() => validateLyrics(Buffer.from('só texto'))).toThrow(/tempo/);
    expect(() => validateLyrics(Buffer.from([0xff, 0xfe, 0x00, 0x41]))).toThrow(/UTF-8/);
    expect(() => validateLyrics(Buffer.from('[00:01.00]a\u0000b'))).toThrow(/inválido/);
  });
});

describe('validateUpload', () => {
  const base = { artist: 'Banda Teste', title: 'Música Nova', key: 'E minor', bpm: '120' };

  it('monta o registro com id, nomes e tipos definidos pelo servidor', async () => {
    const files: IncomingFiles = {
      stem_vocals: file(wav(6), '../../etc/passwd.mp3'),
      stem_bass: file(wav(6)),
      lyrics: file(LRC),
      cover: file(PNG, 'capa.jpg'),
    };
    const { record, files: out } = await validateUpload({ ...base, youtubeId: 'B2R3WZXzsNA' }, files);
    expect(record).toEqual({
      id: 'banda-teste-musica-nova',
      title: 'Música Nova',
      artist: 'Banda Teste',
      key: 'E minor',
      bpm: 120,
      durationSec: 6,
      stems: [
        { name: 'vocals', file: 'vocals.wav' },
        { name: 'bass', file: 'bass.wav' },
      ],
      lyricsFile: 'lyrics.lrc',
      coverFile: 'cover.png', // tipo real (PNG), não o nome enviado (.jpg)
      video: { youtubeId: 'B2R3WZXzsNA', offsetSec: 0 },
    });
    expect(out.map((f) => [f.name, f.contentType])).toEqual([
      ['vocals.wav', 'audio/wav'],
      ['bass.wav', 'audio/wav'],
      ['lyrics.lrc', 'text/plain; charset=utf-8'],
      ['cover.png', 'image/png'],
    ]);
  });

  it('rejeita arquivo que não é áudio, mesmo com nome .mp3', async () => {
    await expect(validateUpload(base, { stem_vocals: file(Buffer.from('MZ fake exe'.repeat(100)), 'voz.mp3') })).rejects.toThrow(
      /não é um arquivo de áudio|não suportado/,
    );
  });

  it('exige ao menos um stem e campos obrigatórios', async () => {
    await expect(validateUpload(base, {})).rejects.toThrow(/pelo menos um stem/);
    await expect(validateUpload({ ...base, artist: '' }, { stem_bass: file(wav(6)) })).rejects.toThrow(/Artista/);
  });

  it('rejeita stems com durações muito diferentes e áudio curto demais', async () => {
    await expect(validateUpload(base, { stem_vocals: file(wav(6)), stem_bass: file(wav(12)) })).rejects.toThrow(/durações/);
    await expect(validateUpload(base, { stem_vocals: file(wav(1)) })).rejects.toThrow(/duração inválida/);
  });

  it('valida tom, BPM, YouTube e id', async () => {
    const stems = { stem_bass: file(wav(6)) };
    await expect(validateUpload({ ...base, key: 'H minor' }, stems)).rejects.toThrow(/Tom/);
    await expect(validateUpload({ ...base, bpm: '9999' }, stems)).rejects.toThrow(/BPM/);
    await expect(validateUpload({ ...base, youtubeId: 'javascript:alert(1)' }, stems)).rejects.toThrow(/YouTube/);
    await expect(validateUpload({ ...base, artist: '???', title: '!!!' }, stems)).rejects.toThrow(/letras ou números/);
  });

  it('rejeita capa que não é imagem', async () => {
    await expect(validateUpload(base, { stem_bass: file(wav(6)), cover: file(Buffer.from('<svg/>')) })).rejects.toThrow(/Capa/);
  });
});

describe('validateFileList (pedido de upload)', () => {
  it('aceita a lista e rejeita campos desconhecidos, repetidos e tamanhos inválidos', () => {
    expect(validateFileList([{ field: 'stem_bass', size: 10 }, { field: 'cover', size: 5 }])).toHaveLength(2);
    expect(() => validateFileList([{ field: 'hack', size: 10 }])).toThrow(/inválida/);
    expect(() => validateFileList([{ field: 'stem_bass', size: 1 }, { field: 'stem_bass', size: 1 }])).toThrow(/inválida/);
    expect(() => validateFileList([{ field: 'stem_bass', size: -1 }])).toThrow(/Tamanho/);
    expect(() => validateFileList([{ field: 'stem_bass', size: 1.5 }])).toThrow(/Tamanho/);
    expect(() => validateFileList([{ field: 'stem_bass', size: 41 * 1024 * 1024 }])).toThrow(/grande demais/);
    expect(() => validateFileList([{ field: 'cover', size: 10 }])).toThrow(/pelo menos um stem/);
    expect(() => validateFileList('x')).toThrow(/inválida/);
    expect(() => validateFileList([])).toThrow(/inválida/);
  });
});
