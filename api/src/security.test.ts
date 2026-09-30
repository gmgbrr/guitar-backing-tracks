import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asyncHandler, errorHandler, hostGuard, HttpError, originGuard, SONG_ID_RE } from './security';

const opts = { allowedOrigins: ['http://localhost:5173'], allowedHosts: ['localhost', '127.0.0.1'] };

let base = '';
let close: () => void;

beforeAll(async () => {
  const app = express();
  app.use(hostGuard(opts));
  app.use(originGuard(opts));
  app.get('/ok', (_req, res) => res.json({ ok: true }));
  app.put('/write', (_req, res) => res.json({ written: true }));
  app.get('/boom', asyncHandler(async () => { throw new Error('segredo interno do Firestore'); }));
  app.get('/teapot', asyncHandler(async () => { throw new HttpError(418, 'mensagem segura'); }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());

const req = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) => fetch(base + path, init);

describe('hostGuard (DNS rebinding)', () => {
  it('aceita localhost/127.0.0.1', async () => expect((await req('/ok')).status).toBe(200));
  it('rejeita Host de outro domínio', async () => {
    // fetch não deixa trocar o Host; usa http cru
    const http = await import('node:http');
    const status = await new Promise<number>((resolve) => {
      const r = http.request(base + '/ok', { headers: { Host: 'evil.example.com' } }, (res) => resolve(res.statusCode!));
      r.end();
    });
    expect(status).toBe(421);
  });
});

describe('originGuard (CSRF)', () => {
  it('leitura não exige origem', async () => expect((await req('/ok', { headers: { Origin: 'https://evil.example' } })).status).toBe(200));
  it('escrita da origem permitida passa', async () =>
    expect((await req('/write', { method: 'PUT', headers: { Origin: 'http://localhost:5173' } })).status).toBe(200));
  it('escrita de outro site é bloqueada', async () =>
    expect((await req('/write', { method: 'PUT', headers: { Origin: 'https://evil.example' } })).status).toBe(403));
  it('escrita sem Origin nem Referer é bloqueada', async () => expect((await req('/write', { method: 'PUT' })).status).toBe(403));
  it('Referer de origem permitida serve de fallback', async () =>
    expect((await req('/write', { method: 'PUT', headers: { Referer: 'http://localhost:5173/upload' } })).status).toBe(200));
});

describe('errorHandler', () => {
  it('erro inesperado vira 500 genérico, sem vazar detalhes', async () => {
    const r = await req('/boom');
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('segredo');
  });
  it('HttpError mantém status e mensagem', async () => {
    const r = await req('/teapot');
    expect(r.status).toBe(418);
    expect(await r.json()).toEqual({ error: 'mensagem segura' });
  });
});

describe('SONG_ID_RE', () => {
  it.each(['black-sabbath-paranoid', 'a', 'x1'])('aceita %s', (id) => expect(SONG_ID_RE.test(id)).toBe(true));
  it.each(['', '../x', 'a/b', 'A', '-a', 'a-', 'a.b', 'a'.repeat(121), '__proto__'])('rejeita %s', (id) =>
    expect(SONG_ID_RE.test(id)).toBe(false),
  );
});
