Write-Host "Running..." -ForegroundColor Magenta

Set-Location (Join-Path $PSScriptRoot "..")
if (-not (Test-Path "node_modules")) { npm ci }
npx astro dev --host 0.0.0.0
