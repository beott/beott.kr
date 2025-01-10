Write-Host "Remove all generated files and directories..." -ForegroundColor Cyan

Remove-Item -Force -Recurse -ErrorAction SilentlyContinue `
  "posts/", `
  "images/", `
  "about/", `
  "categories/", `
  "public/", `
  "js/", `
  "page/", `
  "resources/", `
  "scss/", `
  "series/", `
  "tags/", `
  "vendor/", `
  "404.html", `
  "index.html", `
  "index.xml", `
  "robots.txt", `
  "rss.xsl", `
  "sitemap.xml"
