# guitar-backing-tracks

Ferramenta para customizar faixas de áudio junto com tablaturas e letras de músicas.

Player web com stems separados (voz, bateria, baixo, outros), volume individual por faixa e letra sincronizada (LRC).

## Rodar localmente

```bash
npm install
npm run import            # organiza os arquivos soltos da raiz em data/songs/
npm run dev               # API em :3001 + web em http://localhost:5173, dados no Google Cloud
npm run dev:local         # mesmo app lendo data/ local (só se você tiver as músicas em disco)
npm test                  # testes do parser LRC
```

Atalhos no player: **Espaço** play/pause, **← / →** ±5 s, **V** vídeo/letra, **M** liga/desliga o metrônomo, **B** alinha o metrônomo (aperte numa batida 1). Clique numa linha da letra para ir até ela. Duplo clique num slider volta para 100%.

### Metrônomo

Fica no painel do mixer. Começa com o BPM da música; para alinhar com a gravação, toque a música e clique em **Alinhar no 1** (ou **B**) exatamente numa batida 1 do compasso, depois ajuste fino com **Início ±10 ms**. **Salvar** grava BPM, compasso e alinhamento no `song.json` da música.

## Adicionar músicas pelo app

Na listagem, **+ Adicionar música** abre a tela de envio: arraste os stems, a letra `.lrc` e a capa. O app reconhece o papel de cada arquivo pelo nome (e preenche artista, título, tom e BPM quando os stems seguem o padrão abaixo); dá para corrigir cada um antes de enviar. A música vai direto para o Firestore e o Cloud Storage.

Limites: stems até 40 MB cada (mp3, wav, flac, ogg, m4a; entre 5 s e 30 min, com durações parecidas), letra `.lrc` sincronizada em UTF-8 até 200 KB, capa JPG/PNG/WebP até 5 MB.

## Adicionar músicas por linha de comando

Coloque numa pasta os stems e a letra com estes nomes:

```
<Artista> - <Título>[ ...]-<vocals|drums|bass|guitar|piano|other>-<Tom>-<BPM>bpm-<Hz>hz.mp3
<Artista> - <Título>.lrc          (opcional)
<Título>-cover.jpg                (opcional; também aceita "<Artista> - <Título>.jpg", png ou webp)
```

e rode `npm run import -- <pasta>` e depois `npm run push-gcp`. Depois de enviada, os arquivos locais da música podem ser apagados. Cada música vira `data/songs/<slug>/` com `song.json`, os stems, `lyrics.lrc` e `cover.jpg`. Reimportar uma música preserva o vídeo e o metrônomo configurados no app.

## Vídeo com a tablatura (YouTube)

No player, aba **Vídeo** → cole o link do YouTube. O vídeo aparece sem controles e sempre mudo, e segue a track: play, pause, pulos e a barra de posição comandam o vídeo, que é corrigido automaticamente se se desviar.

Para sincronizar o início, clique em **Ajustar sincronia**:

1. pause a track num ponto fácil de reconhecer (ex.: a primeira nota);
2. mova só o vídeo até o mesmo ponto (slider ou ±0,1 s / ±1 s);
3. clique em **Alinhar vídeo com a track**, dê play para conferir e **Salvar**.

Também dá para ajustar o início direto (±0,1 s / ±1 s) ou usar **Vídeo começa agora**. O ajuste fica salvo no `song.json` (`video.offsetSec` = tempo da track em que o vídeo está no segundo 0). Vídeos cujo dono bloqueou a incorporação fora do YouTube não podem ser exibidos.

## Segurança

- A API escuta só em `127.0.0.1` e recusa `Host` de outros domínios (DNS rebinding).
- Alterações (PUT/POST/DELETE) só são aceitas vindas das páginas do próprio app (`Origin`/`Referer`), bloqueando CSRF de outros sites.
- Ids de música, JSON (máx. 10 KB) e todos os campos são validados; ids e nomes de arquivos gravados são gerados pelo servidor.
- Uploads: tipo detectado pelo conteúdo (áudio lido de verdade, imagens por assinatura de bytes), tamanhos limitados, um envio por vez, 20 por hora; nunca sobrescrevem arquivos ou músicas existentes, e um envio que falha no meio é desfeito.
- Limite de requisições, cabeçalhos de segurança (CSP etc.), erros sem detalhes internos e nenhuma falha assíncrona derruba o servidor.
- Firestore: regras [gcp/firestore.rules](gcp/firestore.rules) negam todo acesso direto; só a API (conta de serviço) lê e grava. Bucket privado (sem assinatura → 403).

## Estrutura

| Pasta | O quê |
|---|---|
| `shared/` | Tipos compartilhados (`SongRecord`, `SongSummary`, `SongDetail`) |
| `api/` | Express. `SongRepository` (metadados) e `MediaStorage` (URLs de mídia) são interfaces com implementação local |
| `web/` | Vite + React. `src/audio/StemPlayer.ts` é o motor Web Audio (sources sincronizados → gain por stem → master) |
| `scripts/import-song.ts` | Importador de arquivos |

## Google Cloud

Os dados ficam no projeto `backing-tracks-510200` (região us-east1):

| O quê | Onde |
|---|---|
| Dados de cada música (o `song.json`) | Firestore, coleção `songs`, documento `songs/<id>` |
| Stems, letra e capa | Cloud Storage, bucket privado `backing-tracks-510200-media`, em `songs/<id>/<arquivo>` |

```bash
npm run push-gcp            # envia data/songs/ para a nuvem (só o que mudou)
npm run push-gcp -- <id>    # só uma música; --force faz o song.json local sobrescrever vídeo/metrônomo da nuvem
```

- O navegador baixa a mídia direto do bucket por **signed URLs** que valem até o fim do dia seguinte e se repetem durante o dia (o cache do navegador funciona e o tráfego fica baixo). Sem assinatura o bucket responde 403.
- As URLs são assinadas pela conta de serviço `backing-tracks-api`; localmente a API usa o seu login (`gcloud auth application-default login`) e se passa por ela, sem chave baixada.
- Vídeo e metrônomo ajustados no app ficam no Firestore e têm prioridade sobre o `song.json` local no `push-gcp`.
- CORS do bucket em [gcp/cors.json](gcp/cors.json); variáveis em [gcp/.env.gcp](gcp/.env.gcp) (só IDs, sem segredos).
- Custo esperado: US$ 0 dentro da cota gratuita (Firestore 1 GiB; Cloud Storage 5 GB em us-east1 ≈ 140 músicas).

## Deploy (Cloud Run)

O app roda no Cloud Run em https://backing-tracks-251094340671.us-east1.run.app, com login pelo Google (IAP: só contas liberadas entram).

- **Deploy contínuo:** cada push na `main` do GitHub dispara o Cloud Build, que executa [cloudbuild.yaml](cloudbuild.yaml): gera a imagem com os buildpacks do Google (sem Dockerfile: `npm ci`, `npm run build`, `npm start`) e publica no Cloud Run.
- O serviço roda com a conta `backing-tracks-api` (só Firestore + este bucket), no máximo 1 instância, 0 quando ninguém usa (custo ~US$ 0).
- Uploads vão direto do navegador ao bucket por links de envio assinados (tamanho máximo garantido pelo Google) e são validados pela API antes de virar música; envios abandonados são apagados em 1 dia ([gcp/lifecycle.json](gcp/lifecycle.json)).
- Imagens antigas são apagadas automaticamente (mantém as 3 mais recentes).
- **Login (IAP):** o projeto não pertence a uma organização, então o IAP usa um cliente OAuth próprio, criado uma vez no console (*Google Auth Platform*: app em modo Teste, só `gabrielmarinho0812@gmail.com` como usuário de teste; cliente *Aplicativo da Web* com o redirecionamento `https://iap.googleapis.com/v1/oauth/clientIds/<CLIENT_ID>:handleRedirect`). Depois, [gcp/configure-iap-oauth.ps1](gcp/configure-iap-oauth.ps1) grava o ID e o segredo no IAP (o segredo é digitado no terminal e não fica salvo). Para liberar outra conta: `gcloud iap web add-iam-policy-binding --resource-type=cloud-run --service=backing-tracks --region=us-east1 --member=user:<email> --role=roles/iap.httpsResourceAccessor` e adicioná-la como usuária de teste.

