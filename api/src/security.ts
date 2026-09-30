import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';

export interface SecurityOptions {
  /** Origens (esquema+host+porta) que podem chamar a API a partir do navegador. */
  allowedOrigins: string[];
  /** Nomes de host aceitos no cabeçalho Host (bloqueia DNS rebinding). */
  allowedHosts: string[];
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Id de música: slug gerado pelo servidor. Qualquer outra coisa é rejeitada antes de tocar no banco. */
export const SONG_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

const hostname = (hostHeader: string) => hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();

/**
 * Rejeita requisições cujo Host não é o esperado. Sem isso, um domínio malicioso que resolve
 * para 127.0.0.1 (DNS rebinding) faria o navegador tratar a API como "mesma origem".
 */
export function hostGuard({ allowedHosts }: SecurityOptions): RequestHandler {
  const allowed = new Set(allowedHosts.map((h) => h.toLowerCase()));
  return (req, res, next) => {
    const host = req.headers.host;
    if (!host || !allowed.has(hostname(host))) {
      res.status(421).json({ error: 'Host não permitido' });
      return;
    }
    next();
  };
}

/**
 * Proteção contra CSRF: métodos que alteram dados só são aceitos se a origem da página
 * for uma das permitidas. Formulários/uploads multipart não disparam preflight de CORS,
 * então a checagem precisa ser feita aqui, não só no CORS.
 */
export function originGuard({ allowedOrigins }: SecurityOptions): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.headers.origin ?? originFromReferer(req.headers.referer);
    if (!origin || !allowed.has(origin)) {
      res.status(403).json({ error: 'Origem não permitida' });
      return;
    }
    next();
  };
}

function originFromReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/** Cabeçalhos de segurança + CSP compatível com o player do YouTube e as signed URLs do GCS. */
export const securityHeaders = () =>
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com'],
        'frame-src': ['https://www.youtube.com', 'https://www.youtube-nocookie.com'],
        'img-src': ["'self'", 'data:', 'https://storage.googleapis.com', 'https://i.ytimg.com'],
        'media-src': ["'self'", 'blob:', 'https://storage.googleapis.com'],
        'connect-src': ["'self'", 'https://storage.googleapis.com'],
        'style-src': ["'self'", "'unsafe-inline'"], // variáveis CSS inline (--progress) nos sliders
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // o iframe do YouTube não envia CORP
  });

const limitMessage = { error: 'Muitas requisições; tente de novo em instantes.' };

/** Leituras: generoso (a página faz várias chamadas). */
export const readLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: limitMessage });
/** Alterações pequenas (vídeo, metrônomo). */
export const writeLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: limitMessage });
/** Upload de músicas: pesado em memória, rede e armazenamento. */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Limite de uploads por hora atingido.' },
});

/** Express 4 não captura rejeições de rotas async: sem isto, um erro do Firestore derrubaria o processo. */
export const asyncHandler =
  <R extends Request = Request>(fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req as R, res, next).catch(next);
  };

/** Erro com status HTTP e mensagem segura para o cliente. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Resposta de erro genérica: detalhes (stack, mensagens do GCP) ficam só no log do servidor. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Erros conhecidos de parsing/limites do Express e do multer
  const status = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : 500;
  if (status === 413 || err?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Arquivo ou requisição grande demais.' });
    return;
  }
  if (typeof err?.code === 'string' && err.code.startsWith('LIMIT_')) {
    res.status(400).json({ error: 'Upload fora dos limites permitidos.' });
    return;
  }
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: 'Requisição inválida.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
};
