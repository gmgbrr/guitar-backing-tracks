import { describe, expect, it } from 'vitest';
import { guessFileRole, parseArtistTitle, parseStemFilename, songId } from './filenames';

describe('parseArtistTitle', () => {
  it.each([
    ['Red Hot Chili Peppers - Under The Bridge - Remastered - (320 Kbps) (1)', 'Red Hot Chili Peppers', 'Under The Bridge'],
    ['Black Sabbath - Paranoid (Official Audio) - (320 Kbps)', 'Black Sabbath', 'Paranoid'],
    ['Artista - Song - 2011 Remaster', 'Artista', 'Song'],
    ['Artista - Hey - Jude', 'Artista', 'Hey - Jude'],
    ['Artista - Semi-Charmed Life', 'Artista', 'Semi-Charmed Life'],
  ])('%s', (input, artist, title) => expect(parseArtistTitle(input)).toEqual({ artist, title }));
});

describe('parseStemFilename', () => {
  it('lê artista, título, stem, tom e BPM', () => {
    expect(parseStemFilename('Black Sabbath - Paranoid (Official Audio) - (320 Kbps)-bass-E minor-164bpm-449hz.mp3')).toEqual({
      artist: 'Black Sabbath',
      title: 'Paranoid',
      stem: 'bass',
      key: 'E minor',
      bpm: 164,
      ext: 'mp3',
    });
  });
  it('fora do padrão → null', () => expect(parseStemFilename('qualquer.mp3')).toBeNull());
});

describe('guessFileRole', () => {
  it.each([
    ['Black Sabbath - Paranoid-vocals-E minor-164bpm-449hz.mp3', { kind: 'stem', stem: 'vocals' }],
    ['minha musica - bateria.wav', { kind: 'stem', stem: 'drums' }],
    ['baixo.mp3', { kind: 'stem', stem: 'bass' }],
    ['song_Guitar_track.flac', { kind: 'stem', stem: 'guitar' }],
    ['Artista - Musica.lrc', { kind: 'lyrics' }],
    ['ab67616d0000b273.jpg', { kind: 'cover' }],
    ['capa.PNG', { kind: 'cover' }],
    ['Artista - Musica (1).mp3', { kind: 'ignore' }],
    ['notas.txt', { kind: 'ignore' }],
  ])('%s', (name, role) => expect(guessFileRole(name)).toEqual(role));
});

describe('songId', () => {
  it('gera slug sem acentos nem símbolos', () => {
    expect(songId('Legião Urbana', 'Tempo Perdido')).toBe('legiao-urbana-tempo-perdido');
    expect(songId('AC/DC', "Back in Black")).toBe('ac-dc-back-in-black');
  });
  it('texto sem letras/números vira vazio (a API rejeita)', () => expect(songId('???', '!!!')).toBe(''));
});
