import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const list = (v: string | undefined, fallback: string[]) =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : fallback;

export const config = {
  port: Number(process.env.PORT ?? 3001),
  /** Só a própria máquina por padrão. No Cloud Run use HOST=0.0.0.0. */
  host: process.env.HOST ?? '127.0.0.1',
  /** Quantos proxies confiáveis há na frente (Cloud Run: 1). 0 = nenhum (rodando local). */
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
  /** Páginas que podem alterar dados pela API (proteção CSRF). */
  allowedOrigins: list(process.env.ALLOWED_ORIGINS, ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3001', 'http://127.0.0.1:3001']),
  /** Valores aceitos no cabeçalho Host (proteção contra DNS rebinding). */
  allowedHosts: list(process.env.ALLOWED_HOSTS, ['localhost', '127.0.0.1', '::1']),
  /** 'local' (data/ em disco) ou 'gcp' (Firestore + Cloud Storage). */
  storageDriver: process.env.STORAGE_DRIVER ?? 'local',
  dataDir: path.resolve(rootDir, process.env.DATA_DIR ?? 'data'),
  /** Build do frontend, servido pela API em produção (um único container no Cloud Run). */
  webDistDir: path.resolve(rootDir, 'web/dist'),
  gcp: {
    project: process.env.GCP_PROJECT ?? 'backing-tracks-510200',
    bucket: process.env.GCS_BUCKET ?? 'backing-tracks-510200-media',
    /**
     * Conta de serviço usada para assinar as URLs de mídia. Localmente a API usa o seu login
     * (gcloud auth application-default login) e se passa por ela; no Cloud Run ela já é a
     * identidade do serviço e isto pode ficar vazio.
     */
    signerServiceAccount:
      process.env.GCP_SIGNER_SA === 'none'
        ? ''
        : (process.env.GCP_SIGNER_SA ?? 'backing-tracks-api@backing-tracks-510200.iam.gserviceaccount.com'),
  },
};
