# cd _blog
Write-Host "Deploying updates to GitHub..."
make build

git add -A
git commit -m "rebuilding site $(Get-Date) on Windows"
git push origin HEAD
