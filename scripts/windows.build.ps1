Write-Host "Build the site..." -ForegroundColor Green

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
if (-not (Test-Path "node_modules")) { npm ci; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
npx astro build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Copy-Item -Path "dist\*" -Destination "." -Recurse -Force
