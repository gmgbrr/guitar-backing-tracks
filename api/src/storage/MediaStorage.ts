/** Resolve onde o navegador baixa os arquivos de mídia. Local: rota /media; futuro: signed URL do GCS. */
export interface MediaStorage {
  getUrl(songId: string, file: string): Promise<string>;
}
