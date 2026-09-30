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

Atalhos no player: **Espaço** play/pause, **← / →** ±5 s, **V** vídeo/letra, **M** liga/desliga o metrônomo, **B** alinha o metrônomo (aperte numa batida 1). Clique numa linha da letra para ir até ela. Duplo clique num slider volta para 100%.

### Metrônomo

Fica no painel do mixer. Começa com o BPM da música; para alinhar com a gravação, toque a música e clique em **Alinhar no 1** (ou **B**) exatamente numa batida 1 do compasso, depois ajuste fino com **Início ±10 ms**. **Salvar** grava BPM, compasso e alinhamento no `song.json` da música.

## Adicionar músicas

Coloque numa pasta os stems e a letra com estes nomes:

```
<Artista> - <Título>[ ...]-<vocals|drums|bass|guitar|piano|other>-<Tom>-<BPM>bpm-<Hz>hz.mp3
<Artista> - <Título>.lrc          (opcional)
```

e rode `npm run import -- <pasta>`. Cada música vira `data/songs/<slug>/` com `song.json`, os stems e `lyrics.lrc`.

## Vídeo com a tablatura (YouTube)

No player, aba **Vídeo** → cole o link do YouTube. O vídeo aparece sem controles e sempre mudo, e segue a track: play, pause, pulos e a barra de posição comandam o vídeo, que é corrigido automaticamente se se desviar.

Para sincronizar o início, clique em **Ajustar sincronia**:

1. pause a track num ponto fácil de reconhecer (ex.: a primeira nota);
2. mova só o vídeo até o mesmo ponto (slider ou ±0,1 s / ±1 s);
3. clique em **Alinhar vídeo com a track**, dê play para conferir e **Salvar**.

Também dá para ajustar o início direto (±0,1 s / ±1 s) ou usar **Vídeo começa agora**. O ajuste fica salvo no `song.json` (`video.offsetSec` = tempo da track em que o vídeo está no segundo 0). Vídeos cujo dono bloqueou a incorporação fora do YouTube não podem ser exibidos.

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
