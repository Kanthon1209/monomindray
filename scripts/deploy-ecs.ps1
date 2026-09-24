#Requires -Version 5.1
<#
.SYNOPSIS
  Build locally and scp to ECS without git commit / GitHub Actions.

.DESCRIPTION
  Cross-compile API + Next standalone on the dev machine; ECS only runs
  docker compose --build that copies prebuilt artifacts (no go/npm on server).
  By default also runs scripts/goose-up.sh so pending SQL migrations apply
  (same as GitHub Actions deploy).

.PARAMETER Target
  all | api | web (default: all)

.PARAMETER SkipBuild
  Pack and upload existing artifacts only

.PARAMETER SkipMigrate
  Skip goose up (default is to migrate)

.PARAMETER SshHost
  SSH host alias (default: env MINDRAY_SSH_HOST or mindray)

.PARAMETER RemoteDir
  Repo path on ECS (default: /home/kanthon/mindray)

.EXAMPLE
  .\scripts\deploy-ecs.ps1
  .\scripts\deploy-ecs.ps1 -Target web
  .\scripts\deploy-ecs.ps1 -SkipBuild -Target api
  .\scripts\deploy-ecs.ps1 -SkipMigrate
#>
[CmdletBinding()]
param(
  [ValidateSet("all", "api", "web")]
  [string]$Target = "all",

  [switch]$SkipBuild,

  [switch]$SkipMigrate,

  [string]$SshHost = $(if ($env:MINDRAY_SSH_HOST) { $env:MINDRAY_SSH_HOST } else { "mindray" }),

  [string]$RemoteDir = $(if ($env:MINDRAY_REMOTE_DIR) { $env:MINDRAY_REMOTE_DIR } else { "/home/kanthon/mindray" })
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

function Write-Step([string]$msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Assert-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing command: $name"
  }
}

Assert-Command ssh
Assert-Command scp
Assert-Command tar

$needApi = $Target -eq "all" -or $Target -eq "api"
$needWeb = $Target -eq "all" -or $Target -eq "web"
$services = switch ($Target) {
  "api" { "api" }
  "web" { "web" }
  default { "api web pgadmin" }
}

$ArtifactsDir = Join-Path $RepoRoot "deploy\artifacts"
New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null

if (-not $SkipBuild) {
  if ($needApi) {
    Write-Step "Cross-compile API (linux/amd64)"
    Assert-Command go
    $apiOut = Join-Path $ArtifactsDir "mindray-api"
    Push-Location (Join-Path $RepoRoot "apps\backend")
    try {
      $env:CGO_ENABLED = "0"
      $env:GOOS = "linux"
      $env:GOARCH = "amd64"
      & go build -trimpath -ldflags "-s -w" -o $apiOut .
      if ($LASTEXITCODE -ne 0) { throw "go build failed ($LASTEXITCODE)" }
    }
    finally {
      Remove-Item Env:CGO_ENABLED -ErrorAction SilentlyContinue
      Remove-Item Env:GOOS -ErrorAction SilentlyContinue
      Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
      Pop-Location
    }
  }

  if ($needWeb) {
    Write-Step "Build frontend (Next.js standalone)"
    Assert-Command npm
    Push-Location (Join-Path $RepoRoot "apps\frontend")
    try {
      if (-not (Test-Path "node_modules")) {
        & npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
      }
      $env:NEXT_PUBLIC_API_URL = ""
      & npm run build
      if ($LASTEXITCODE -ne 0) { throw "npm run build failed ($LASTEXITCODE)" }
    }
    finally {
      Pop-Location
    }
  }
}

if ($needApi -and -not (Test-Path (Join-Path $ArtifactsDir "mindray-api"))) {
  throw "Missing deploy/artifacts/mindray-api (build first or drop -SkipBuild)"
}
if ($needWeb) {
  $standalone = Join-Path $RepoRoot "apps\frontend\.next\standalone"
  $static = Join-Path $RepoRoot "apps\frontend\.next\static"
  if (-not (Test-Path $standalone) -or -not (Test-Path $static)) {
    throw "Missing apps/frontend/.next/standalone or static"
  }
}

Write-Step "Pack artifacts"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tgzName = "mindray-ecs-sync-$stamp.tgz"
$tgzLocal = Join-Path $RepoRoot "deploy\$tgzName"
if (Test-Path $tgzLocal) { Remove-Item $tgzLocal -Force }

$packList = @(
  "deploy/Dockerfile.api",
  "deploy/Dockerfile.web",
  "deploy/docker-compose.ecs.yml",
  "deploy/Caddyfile",
  "deploy/pgadmin",
  "apps/backend/migrations",
  "apps/backend/etc",
  "scripts/goose-up.sh"
)
if ($needApi) { $packList += "deploy/artifacts/mindray-api" }
if ($needWeb) {
  $packList += @(
    "apps/frontend/.next/standalone",
    "apps/frontend/.next/static",
    "apps/frontend/public"
  )
}

& tar @(@("-czf", $tgzLocal) + $packList)
if ($LASTEXITCODE -ne 0) { throw "tar pack failed ($LASTEXITCODE)" }
$sizeMb = [math]::Round((Get-Item $tgzLocal).Length / 1MB, 1)
Write-Host "packed $tgzName ($sizeMb MB)"

Write-Step "Upload to ${SshHost}:/tmp"
$tgzRemote = "/tmp/$tgzName"
& scp $tgzLocal "${SshHost}:$tgzRemote"
if ($LASTEXITCODE -ne 0) { throw "scp failed ($LASTEXITCODE)" }

Write-Step "Remote extract, migrate, restart: $services"
$remoteLines = @(
  "set -euo pipefail",
  "cd '$RemoteDir'",
  "tar -xzf '$tgzRemote'",
  "rm -f '$tgzRemote'",
  "if [ -f deploy/artifacts/mindray-api ]; then chmod +x deploy/artifacts/mindray-api; fi",
  "chmod +x scripts/goose-up.sh",
  "mkdir -p deploy/pgadmin",
  'set -a; . <(sed ''s/\r$//'' deploy/.env); set +a',
  'printf ''%s\n'' "postgres:5432:${DB_NAME:-mindray}:${DB_USER:-mindray}:${DB_PASSWORD:-mindray_secret}" > deploy/pgadmin/pgpass',
  # pgAdmin runs as uid 5050; PassFile must be readable by that user
  "chown 5050:0 deploy/pgadmin/pgpass || true",
  "chmod 600 deploy/pgadmin/pgpass",
  "cd deploy",
  "docker compose -f docker-compose.ecs.yml --env-file .env up -d postgres",
  "sleep 2"
)

if (-not $SkipMigrate) {
  $remoteLines += @(
    "cd '$RemoteDir'",
    "./scripts/goose-up.sh up"
  )
}

$remoteLines += @(
  "cd '$RemoteDir/deploy'",
  "docker compose -f docker-compose.ecs.yml --env-file .env up -d --build $services",
  "sleep 2",
  "docker compose -f docker-compose.ecs.yml ps",
  "curl -sS -o /dev/null -w 'dashboard=%{http_code}\n' http://127.0.0.1/dashboard || true",
  "echo DONE"
)

$remoteScript = (($remoteLines -join "`n") + "`n") -replace "`r", ""
# Windows PowerShell pipes CRLF; strip on the remote before bash.
$remoteScript | & ssh $SshHost "sed 's/\r$//' | bash -s"
if ($LASTEXITCODE -ne 0) { throw "remote apply failed ($LASTEXITCODE)" }

Remove-Item $tgzLocal -Force -ErrorAction SilentlyContinue
Write-Step "Done (goose up + services; for production push main -> Actions)"
Write-Host "Public: http://115.29.235.41/dashboard"
Write-Host "pgAdmin: http://115.29.235.41/pgadmin  (or :5050)"