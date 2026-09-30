import type { UploadField } from '@backing-tracks/shared';

/** Destino de envio de um arquivo: o navegador faz PUT nessa URL com esses cabeçalhos. */
export interface UploadTarget {
  url: string;
  headers: Record<string, string>;
}

/** Arquivos de mídia das músicas. Local: data/songs; nuvem: bucket do Cloud Storage. */
export interface MediaStorage {
  /** URL que o navegador usa para baixar o arquivo. */
  getUrl(songId: string, file: string): Promise<string>;
  /** Grava um arquivo definitivo da música. Nunca sobrescreve um existente. */
  put(songId: string, file: string, data: Buffer, contentType: string): Promise<void>;
  /** Apaga os arquivos informados (usado para desfazer um upload que falhou no meio). */
  remove(songId: string, files: string[]): Promise<void>;

  // ---- área temporária de upload (o navegador envia direto para cá) ----
  /** Autoriza o envio de um arquivo para a área temporária, com tamanho máximo garantido. */
  createUploadTarget(uploadId: string, field: UploadField, maxBytes: number): Promise<UploadTarget>;
  /** Lê um arquivo enviado; null se não existir. Recusa arquivos acima de maxBytes. */
  readStaged(uploadId: string, field: UploadField, maxBytes: number): Promise<Buffer | null>;
  /** Apaga tudo o que foi enviado para este upload. */
  clearStaged(uploadId: string): Promise<void>;
}
