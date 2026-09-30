# Configura o cliente OAuth próprio do IAP para o projeto inteiro (vale para todo serviço protegido por IAP).
# Necessário em projetos sem organização (conta @gmail.com): o IAP não tem cliente OAuth automático.
#
# Uso (no PowerShell, na raiz do projeto):  .\gcp\configure-iap-oauth.ps1
# O segredo do cliente é digitado aqui e vai direto para o IAP; não é salvo em nenhum arquivo.

$ErrorActionPreference = 'Stop'
$gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$project = 'backing-tracks-510200'

$clientId = (Read-Host 'Client ID (termina em .apps.googleusercontent.com)').Trim()
if ($clientId -notmatch '^[\w-]+\.apps\.googleusercontent\.com$') { throw 'Client ID inválido.' }
$secure = Read-Host 'Client secret' -AsSecureString
$secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $secret) { throw 'Client secret vazio.' }

$tmp = New-TemporaryFile
try {
  @"
access_settings:
  oauth_settings:
    client_id: $clientId
    client_secret: $secret
"@ | Set-Content -Path $tmp -Encoding utf8
  & $gcloud iap settings set $tmp --project=$project --quiet --format=none
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao gravar as configurações do IAP.' }
} finally {
  Remove-Item $tmp -Force  # o arquivo temporário com o segredo é apagado mesmo se der erro
}

Write-Host "`nPronto. Em 1-2 minutos, abra: https://stem-251094340671.us-east1.run.app" -ForegroundColor Green
