import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import { config } from './config.js';

const SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

/**
 * Clientes do Firestore e do Cloud Storage com as credenciais padrão (ADC).
 * Se `signerServiceAccount` estiver definido, o Storage age como essa conta de serviço
 * (impersonation) — necessário para gerar signed URLs a partir de um login de usuário.
 */
export async function gcpClients() {
  const { project, bucket, signerServiceAccount } = config.gcp;
  const firestore = new Firestore({ projectId: project, ignoreUndefinedProperties: true });

  let storage: Storage;
  if (signerServiceAccount) {
    const sourceClient = await new GoogleAuth({ scopes: SCOPES }).getClient();
    const authClient = new Impersonated({
      sourceClient,
      targetPrincipal: signerServiceAccount,
      targetScopes: SCOPES,
      lifetime: 3600,
    });
    storage = new Storage({ projectId: project, authClient });
  } else {
    storage = new Storage({ projectId: project });
  }
  return { firestore, bucket: storage.bucket(bucket) };
}
