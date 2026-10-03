/**
 * Grava a afinação padrão (E A D G B E) nas músicas do Firestore que ainda não têm afinação.
 * Músicas que já têm afinação não são alteradas. Pode ser rodado mais de uma vez.
 *
 * Uso: npx tsx scripts/backfill-tuning.ts
 */
import { Firestore } from '@google-cloud/firestore';
import { STANDARD_TUNING } from '../shared/src/tuning.js';

const project = process.env.GCP_PROJECT ?? 'backing-tracks-510200';
const db = new Firestore({ projectId: project });

const snap = await db.collection('songs').get();
let updated = 0;
for (const doc of snap.docs) {
  const data = doc.data() as { title?: string; tuning?: unknown };
  if (Array.isArray(data.tuning) && data.tuning.length === 6) {
    console.log(`  = ${data.title ?? doc.id}: já tem afinação (${(data.tuning as string[]).join(' ')})`);
    continue;
  }
  await doc.ref.update({ tuning: STANDARD_TUNING });
  updated++;
  console.log(`  ✓ ${data.title ?? doc.id}: afinação padrão gravada`);
}
console.log(`${updated} de ${snap.size} música(s) atualizada(s).`);
