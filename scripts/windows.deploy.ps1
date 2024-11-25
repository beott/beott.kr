# cd _blog
Write-Host "Deploying updates to GitHub..."
make clean
hugo build -d .

git add -A
git commit -m "rebuilding site $(Get-Date) on Windows"
git push origin HEAD
