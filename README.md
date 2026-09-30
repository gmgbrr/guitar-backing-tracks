# guitar-backing-tracks

Ferramenta para customizar faixas de áudio junto com tablaturas e letras de músicas.

Player web com stems separados (voz, bateria, baixo, outros), volume individual por faixa e letra sincronizada (LRC).

## Rodar localmente

```bash
npm install
npm run import            # organiza os arquivos soltos da raiz em data/songs/
npm run dev               # API em :3001 + web em http://localhost:5173
npm test                  # testes do parser LRC
```

Atalhos no player: **Espaço** play/pause, **← / →** ±5 s. Clique numa linha da letra para ir até ela. Duplo clique num slider volta para 100%.

## Adicionar músicas

Coloque numa pasta os stems e a letra com estes nomes:

```
<Artista> - <Título>[ ...]-<vocals|drums|bass|guitar|piano|other>-<Tom>-<BPM>bpm-<Hz>hz.mp3
<Artista> - <Título>.lrc          (opcional)
```

e rode `npm run import -- <pasta>`. Cada música vira `data/songs/<slug>/` com `song.json`, os stems e `lyrics.lrc`.

## Estrutura

| Pasta | O quê |
|---|---|
| `shared/` | Tipos compartilhados (`SongRecord`, `SongSummary`, `SongDetail`) |
| `api/` | Express. `SongRepository` (metadados) e `MediaStorage` (URLs de mídia) são interfaces com implementação local |
| `web/` | Vite + React. `src/audio/StemPlayer.ts` é o motor Web Audio (sources sincronizados → gain por stem → master) |
| `scripts/import-song.ts` | Importador de arquivos |

## Migração para o Google Cloud

1. **Arquivos** → Cloud Storage: suba `data/songs/<slug>/*` para `gs://<bucket>/songs/<slug>/`.
2. **Metadados** → Firestore: cada `song.json` vira um documento na coleção `songs` (mesmo formato).
3. Implemente `FirestoreSongRepository` e `GcsMediaStorage` (retornando signed URLs) e registre-os em `createAdapters()` de `api/src/index.ts` sob `STORAGE_DRIVER=gcp`. O frontend não muda.
4. **App** → Cloud Run: `npm run build` e rode a API; ela já serve `web/dist` quando o build existe (um único container).
