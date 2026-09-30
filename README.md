# guitar-backing-tracks

Ferramenta para estudar música com faixas separadas: player web com stems (voz, bateria, baixo, outros), volume individual por faixa, letra sincronizada, vídeo com tablatura e metrônomo.

## Funcionalidades

- **Player de stems:** todas as faixas tocam sincronizadas; cada uma tem volume, mudo e solo, além do volume geral. Play/pause, avançar/voltar e barra de posição.
- **Letra sincronizada:** arquivos `.lrc` rolam junto com a música, com a linha atual em destaque; clicar numa linha leva a música até ela.
- **Vídeo com tablatura:** um vídeo do YouTube é exibido mudo e sem controles, acompanhando a música. O início do vídeo pode ser alinhado com a faixa, e um botão abre o vídeo original no ponto atual.
- **Metrônomo:** BPM, compasso e alinhamento da batida 1 ajustáveis e salvos por música, com clique acentuado no primeiro tempo.
- **Adicionar músicas:** pela própria interface (arrastar stems, letra e capa) ou por linha de comando; o app reconhece o papel de cada arquivo pelo nome e preenche artista, título, tom e BPM quando possível.
- **Atalhos:** Espaço (play/pause), ← / → (±5 s), V (vídeo/letra), M (metrônomo), B (alinhar metrônomo).

## Rodar localmente

```bash
npm install
npm run dev          # API + web em http://localhost:5173 (dados na nuvem)
npm run dev:local    # mesmo app lendo arquivos locais em data/
npm test
```

Para rodar com a nuvem é preciso configurar um projeto próprio no Google Cloud (Firestore + Cloud Storage) e as variáveis de ambiente usadas pela API.

## Segurança

- Todo acesso ao app publicado exige login; só contas autorizadas entram.
- A API aceita alterações apenas vindas das páginas do próprio app e valida o `Host` das requisições.
- Todos os campos são validados no servidor; identificadores e nomes de arquivos gravados são gerados pelo servidor, nunca aceitos do cliente.
- Uploads: o tipo de cada arquivo é verificado pelo conteúdo real, com tamanho e frequência limitados; um envio nunca sobrescreve músicas existentes e é desfeito se falhar no meio.
- Limite de requisições, cabeçalhos de segurança e respostas de erro sem detalhes internos.
- Banco de dados sem acesso direto e armazenamento de arquivos privado: só a API, com credenciais próprias, lê e grava; a mídia é entregue por links temporários assinados.

## Estrutura

| Pasta | O quê |
|---|---|
| `shared/` | Tipos e regras compartilhadas entre API, web e scripts |
| `api/` | API (Express). Metadados e arquivos de mídia ficam atrás de interfaces com implementação local e em nuvem |
| `web/` | Frontend (Vite + React). `src/audio/StemPlayer.ts` é o motor de áudio (Web Audio) |
| `scripts/` | Importação de músicas e envio para a nuvem |

## Deploy

O app é publicado automaticamente a cada push na `main`: um pipeline de build ([cloudbuild.yaml](cloudbuild.yaml)) gera a aplicação com buildpacks (sem Dockerfile) e publica no Cloud Run.
