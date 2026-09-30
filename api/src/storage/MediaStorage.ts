/** Arquivos de mídia das músicas. Local: data/songs; nuvem: bucket do Cloud Storage. */
export interface MediaStorage {
  /** URL que o navegador usa para baixar o arquivo. */
  getUrl(songId: string, file: string): Promise<string>;
  /** Grava um arquivo (usado pelo upload de músicas). */
  put(songId: string, file: string, data: Buffer, contentType: string): Promise<void>;
  /** Apaga os arquivos informados (usado para desfazer um upload que falhou no meio). */
  remove(songId: string, files: string[]): Promise<void>;
}
