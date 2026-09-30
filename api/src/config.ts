import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const config = {
  port: Number(process.env.PORT ?? 3001),
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
      process.env.GCP_SIGNER_SA ?? 'backing-tracks-api@backing-tracks-510200.iam.gserviceaccount.com',
  },
};
