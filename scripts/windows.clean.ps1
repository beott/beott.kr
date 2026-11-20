Write-Host "Remove all generated files and directories..." -ForegroundColor Cyan

# repo 루트의 생성물(scripts/generated-paths.txt)만 지운다. 소스 디렉터리는 목록에 있어도 지우지 않는다.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
if (-not (Test-Path "astro.config.mjs")) { throw "repo 루트를 찾지 못했습니다." }

$protected = @(".git", ".github", ".vscode", "assets", "content", "node_modules", "public", "scripts", "src", "tests", "dist", ".astro", "CNAME", "README.md", "AGENTS.md", "Makefile", "package.json", "package-lock.json", "astro.config.mjs", "tsconfig.json")

Get-Content "scripts/generated-paths.txt" | ForEach-Object {
  $pattern = $_.Trim()
  if ($pattern -eq "" -or $pattern.StartsWith("#")) { return }
  Get-Item -Path $pattern.TrimEnd("/") -ErrorAction SilentlyContinue | ForEach-Object {
    if ($protected -contains $_.Name) { throw "보호 대상 경로라서 지우지 않습니다: $($_.Name)" }
    Remove-Item -LiteralPath $_.FullName -Force -Recurse
  }
}
