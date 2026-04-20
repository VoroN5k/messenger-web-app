<#
.SYNOPSIS
  Task runner for Vesper — PowerShell equivalent of the Makefile.
  Usage: .\tasks.ps1 <task>

.EXAMPLE
  .\tasks.ps1 dev
  .\tasks.ps1 fly-deploy-server
  .\tasks.ps1 help
#>

param(
    [Parameter(Position = 0)]
    [string]$Task = 'help'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Step([string]$msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

switch ($Task) {

    # ── Local development ───────────────────────────────────────────────────
    'dev' {
        Invoke-Step 'Starting dev environment (hot-reload)...'
        docker compose up
    }
    'dev-build' {
        Invoke-Step 'Rebuilding images and starting dev environment...'
        docker compose up --build
    }
    'down' {
        Invoke-Step 'Stopping containers...'
        docker compose down
    }
    'logs' {
        docker compose logs -f
    }
    'logs-server' {
        docker compose logs -f server
    }
    'logs-client' {
        docker compose logs -f client
    }

    # ── Production parity test ──────────────────────────────────────────────
    'prod' {
        Invoke-Step 'Running production containers locally...'
        docker compose -f docker-compose.prod.yml up
    }
    'prod-build' {
        Invoke-Step 'Rebuilding production images...'
        docker compose -f docker-compose.prod.yml up --build
    }

    # ── Database ────────────────────────────────────────────────────────────
    'prisma-migrate' {
        Invoke-Step 'Running Prisma migrations via DIRECT_URL...'
        Push-Location server
        $directUrl = (Get-Content .env | Where-Object { $_ -match '^DIRECT_URL=' }) -replace '^DIRECT_URL=', ''
        if (-not $directUrl) { $directUrl = (Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=', '' }
        $env:DATABASE_URL = $directUrl
        npx prisma migrate deploy
        Pop-Location
    }
    'prisma-studio' {
        Push-Location server
        npx prisma studio
        Pop-Location
    }

    # ── fly.io ──────────────────────────────────────────────────────────────
    'fly-setup' {
        Invoke-Step 'Creating fly.io apps (run once)...'
        Push-Location server
        fly apps create voronsk-server --org personal
        Pop-Location
        Push-Location client
        fly apps create voronsk-client --org personal
        Pop-Location
    }
    'fly-secrets' {
        Invoke-Step 'Pushing secrets from server/.env to fly.io...'
        Push-Location server
        Get-Content .env |
            Where-Object { $_ -notmatch '^\s*#' -and $_ -match '=' } |
            ForEach-Object {
                $key, $val = $_ -split '=', 2
                Write-Host "  Setting $key"
                fly secrets set "$key=$val" --app voronsk-server
            }
        Pop-Location
    }
    'fly-deploy-server' {
        Invoke-Step 'Deploying server to fly.io...'
        Push-Location server
        fly deploy
        Pop-Location
    }
    'fly-deploy-client' {
        Invoke-Step 'Deploying client to fly.io...'
        Push-Location client
        fly deploy
        Pop-Location
    }
    'fly-deploy' {
        & $PSCommandPath fly-deploy-server
        & $PSCommandPath fly-deploy-client
    }

    # ── Help ────────────────────────────────────────────────────────────────
    default {
        Write-Host ""
        Write-Host "  Vesper task runner" -ForegroundColor White
        Write-Host ""
        $tasks = @(
            @{ name = 'dev';               desc = 'Start dev environment (hot-reload)' }
            @{ name = 'dev-build';         desc = 'Rebuild images then start dev' }
            @{ name = 'down';              desc = 'Stop containers' }
            @{ name = 'logs';              desc = 'Tail all logs' }
            @{ name = 'prod';              desc = 'Run production containers locally' }
            @{ name = 'prod-build';        desc = 'Rebuild production images then run' }
            @{ name = 'prisma-migrate';    desc = 'Apply pending DB migrations (DIRECT_URL)' }
            @{ name = 'prisma-studio';     desc = 'Open Prisma Studio' }
            @{ name = 'fly-setup';         desc = 'Create fly.io apps (once)' }
            @{ name = 'fly-secrets';       desc = 'Push server/.env secrets to fly.io' }
            @{ name = 'fly-deploy-server'; desc = 'Deploy server to fly.io' }
            @{ name = 'fly-deploy-client'; desc = 'Deploy client to fly.io' }
            @{ name = 'fly-deploy';        desc = 'Deploy both services' }
        )
        foreach ($t in $tasks) {
            Write-Host ("  {0,-24}{1}" -f $t.name, $t.desc) -ForegroundColor Gray
        }
        Write-Host ""
        Write-Host "  Usage: .\tasks.ps1 <task>" -ForegroundColor DarkGray
        Write-Host ""
    }
}
