Write-Host "Running..." -ForegroundColor Magenta

hugo server --contentDir=content --bind=0.0.0.0 --baseURL=http://127.0.0.1
