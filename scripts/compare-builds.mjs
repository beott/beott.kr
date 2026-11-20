/**
 * 기존 Hugo 빌드와 Astro 빌드(dist/)의 동등성을 비교합니다.
 *
 * 사용법: node scripts/compare-builds.mjs <hugo 출력 폴더> [astro 출력 폴더=dist] [--json 결과파일]
 * - 생성 경로 집합, 정적 파일 바이트, sitemap <loc>/<lastmod>, RSS item, index.json,
 *   HTML 페이지별 DOM(정규화한 태그·속성·텍스트)과 핵심 요소(title, meta, 이미지, 링크)를 비교합니다.
 * - 지문(hash)이 붙은 css/js 번들 경로는 `asset:<이름>`으로 정규화합니다.
 * 차이가 있으면 종료 코드 1을 돌려줍니다(허용 목록에 있는 차이는 제외).
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parse } from "parse5";

const args = process.argv.slice(2);
const jsonIndex = args.indexOf("--json");
const jsonPath = jsonIndex === -1 ? null : args.splice(jsonIndex, 2)[1];
const [hugoArg, astroArg = "dist"] = args;
if (!hugoArg) {
  console.error("사용법: node scripts/compare-builds.mjs <hugo 출력 폴더> [astro 출력 폴더]");
  process.exit(2);
}
const HUGO = resolve(hugoArg);
const ASTRO = resolve(astroArg);

/**
 * 의도한 차이 목록입니다. 각 항목은 이유와 함께 보고서에 표시되고 실패로 세지 않습니다.
 * - 번들 파일 이름·형식: Astro 번들러가 지문과 이름을 정하므로 경로가 다르며, SRI 속성은 일괄 제거했습니다.
 * - /search/: 요구사항에 따라 sitemap에 추가했습니다.
 */
const ALLOWED = [
  { kind: "path-only-hugo", match: /^\/(?:css|js)\/.+\.(?:css|js)$|^\/post\.min\..+\.js$/, reason: "Hugo 지문 번들 파일(Astro는 다른 이름으로 생성)" },
  { kind: "path-only-astro", match: /^\/(?:css|js)\/.+\.(?:css|js)$/, reason: "Astro 지문 번들 파일" },
  { kind: "sitemap-only-astro", match: /^https:\/\/beott\.kr\/search\/$/, reason: "요구사항: sitemap에 /search/ 추가" },
  { kind: "script-execution", match: /^\/posts\/.+\/$/, reason: "post.js: Hugo는 본문 끝 일반 script, Astro는 type=module(지연 실행). 대상 버튼·말풍선 요소가 먼저 있으므로 동작은 같음" },
  { kind: "file-bytes", match: /^\/sitemap\.xml$/, reason: "sitemap에 /search/ 추가로 바이트가 다름(나머지 56개 항목은 별도 비교)" },
];

const report = { summary: {}, differences: [], allowed: [] };

/** 차이를 기록합니다. 허용 목록과 맞으면 allowed로 분류합니다. */
function difference(kind, subject, detail = "") {
  const allowed = ALLOWED.find((rule) => rule.kind === kind && rule.match.test(subject));
  const item = { kind, subject, detail };
  if (allowed) report.allowed.push({ ...item, reason: allowed.reason });
  else report.differences.push(item);
}

/** 폴더 아래 모든 파일의 상대 경로를 모읍니다. */
async function listFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : [relative(root, path).split(sep).join("/")];
  }));
  return nested.flat();
}

/** 파일 경로를 사이트 URL 경로로 바꿉니다(`a/index.html` → `/a/`). */
function urlOf(file) {
  return `/${file}`.replace(/(^|\/)index\.html$/, "$1");
}

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** 지문이 붙은 번들 경로를 `asset:<이름>`으로 정규화합니다. */
function normalizeAsset(value) {
  const match = value.match(/^\/(?:(?:css|js)\/)?([a-z-]+)(?:\.min)?\.[\w-]+\.(css|js)$/i);
  return match && !value.endsWith("/sw.js") ? `asset:${match[1]}.${match[2]}` : value;
}

const collapse = (text) => text.replace(/\s+/g, " ").trim();

const INLINE_TAGS = new Set(["a", "abbr", "b", "button", "code", "del", "em", "i", "img", "input", "label", "mark", "s", "small", "span", "strong", "sub", "sup", "svg", "u"]);

/** 공백이 렌더링에 영향을 주는 인라인 이웃(텍스트·인라인 요소)인지 확인합니다. */
function isInlineNeighbor(node) {
  if (!node) return false;
  if (node.nodeName === "#text") return collapse(node.value) !== "";
  return INLINE_TAGS.has(node.nodeName);
}

/** 형제 목록에서 앞·뒤 이웃을 찾습니다(주석 제외). */
function neighbors(node) {
  const siblings = (node.parentNode?.childNodes ?? []).filter((child) => child.nodeName !== "#comment");
  const index = siblings.indexOf(node);
  return { previous: siblings[index - 1], next: siblings[index + 1] };
}

/** HTML 문서를 비교용 줄 목록(태그·정규화 속성·텍스트)으로 펼칩니다. */
function flatten(html) {
  const document = parse(html);
  const lines = [];
  const facts = { title: "", meta: {}, images: [], links: [], scripts: [], stylesheets: [] };
  const walk = (node, depth, inBody = false) => {
    if (node.nodeName === "#comment" || node.nodeName === "#documentType") return;
    if (node.nodeName === "#text") {
      const text = collapse(node.value);
      // body 안에서 인라인 이웃과 맞닿은 공백은 렌더링(띄어쓰기)에 영향을 주므로 유무(␠)를 함께 비교합니다.
      const { previous, next } = neighbors(node);
      const leading = inBody && /^\s/.test(node.value) && isInlineNeighbor(previous) ? "␠" : "";
      const trailing = inBody && /\s$/.test(node.value) && isInlineNeighbor(next) ? "␠" : "";
      if (text) lines.push(`${" ".repeat(depth)}"${leading}${text}${trailing}"`);
      else if (inBody && isInlineNeighbor(previous) && isInlineNeighbor(next)) lines.push(`${" ".repeat(depth)}"␠"`);
      return;
    }
    if (node.nodeName === "#document") {
      node.childNodes.forEach((child) => walk(child, depth));
      return;
    }
    const childInBody = inBody || node.nodeName === "body";
    const attributes = Object.fromEntries((node.attrs || []).map((attribute) => [attribute.name, attribute.value]));
    let tag = node.nodeName;
    if (tag === "script") {
      const src = attributes.src ? normalizeAsset(attributes.src) : "";
      const execution = attributes.type === "module" || "defer" in attributes ? "deferred" : attributes.async !== undefined ? "async" : "blocking";
      // Hugo(Go html/template)는 인라인 스크립트의 주석을 지우므로 줄 주석을 빼고 비교합니다.
      const content = (node.childNodes?.map((child) => child.value).join("") ?? "").replace(/(^|\s)\/\/.*$/gm, "$1");
      // 번들 스크립트의 실행 시점(defer/module/blocking)은 facts.scripts에서 따로 비교합니다.
      const signature = src.startsWith("asset:") ? `script src=${src}`
        : src ? `script src=${src} (${execution})` : `script inline sha=${sha(collapse(content)).slice(0, 12)}`;
      facts.scripts.push(src ? `${src} (${execution})` : signature);
      lines.push(`${" ".repeat(depth)}<${signature}>`);
      return;
    }
    for (const name of ["integrity", "crossorigin", "defer", "type"]) {
      if (tag === "link" && attributes.rel === "stylesheet" && name !== "type") delete attributes[name];
    }
    if (attributes.href) attributes.href = normalizeAsset(attributes.href);
    if (tag === "title") facts.title = collapse(node.childNodes?.map((child) => child.value || "").join("") ?? "");
    // 생성기 표시는 도구 이름만 다르므로 값을 정규화합니다.
    if (tag === "meta" && attributes.name === "generator") attributes.content = "<generator>";
    if (tag === "meta" && (attributes.name || attributes.property)) facts.meta[attributes.name || attributes.property] = attributes.content;
    if (tag === "img") facts.images.push(attributes.src);
    if (tag === "a") facts.links.push(attributes.href);
    if (tag === "link" && attributes.rel === "stylesheet") facts.stylesheets.push(attributes.href);
    if (attributes.style) attributes.style = collapse(attributes.style);
    const rendered = Object.keys(attributes).sort().map((name) => `${name}=${JSON.stringify(attributes[name])}`).join(" ");
    lines.push(`${" ".repeat(depth)}<${tag}${rendered ? ` ${rendered}` : ""}>`);
    const children = node.nodeName === "template" ? node.content.childNodes : node.childNodes || [];
    children.forEach((child) => walk(child, depth + 1, childInBody));
  };
  walk(document, 0);
  return { lines, facts };
}

/** 두 줄 목록의 첫 차이 위치와 앞뒤 맥락을 돌려줍니다. */
function firstLineDifference(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  if (index === left.length && index === right.length) return null;
  return { line: index, hugo: left.slice(index, index + 3), astro: right.slice(index, index + 3) };
}

/** XML에서 태그 내용을 뽑습니다. */
const tagValues = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((match) => match[1]);

/** RSS item 목록을 비교 가능한 객체로 뽑습니다. */
function rssItems(xml) {
  return tagValues(xml, "item").map((item) => Object.fromEntries(
    ["title", "link", "pubDate", "guid", "description"].map((tag) => [tag, tagValues(item, tag)[0] ?? ""]),
  ));
}

const hugoFiles = new Set(await listFiles(HUGO));
const astroFiles = new Set(await listFiles(ASTRO));
const hugoUrls = new Map([...hugoFiles].map((file) => [urlOf(file), file]));
const astroUrls = new Map([...astroFiles].map((file) => [urlOf(file), file]));

for (const url of hugoUrls.keys()) if (!astroUrls.has(url)) difference("path-only-hugo", url);
for (const url of astroUrls.keys()) if (!hugoUrls.has(url)) difference("path-only-astro", url);
const shared = [...hugoUrls.keys()].filter((url) => astroUrls.has(url)).sort();
report.summary.paths = { hugo: hugoUrls.size, astro: astroUrls.size, shared: shared.length };

let identicalBytes = 0;
const html = { compared: 0, identicalDom: 0 };
const feeds = { compared: 0, identicalBytes: 0, items: 0 };
for (const url of shared) {
  const hugoBuffer = await readFile(join(HUGO, hugoUrls.get(url)));
  const astroBuffer = await readFile(join(ASTRO, astroUrls.get(url)));
  const same = hugoBuffer.equals(astroBuffer);
  if (same) identicalBytes += 1;
  const file = hugoUrls.get(url);
  if (file.endsWith(".html")) {
    html.compared += 1;
    const hugo = flatten(hugoBuffer.toString("utf8"));
    const astro = flatten(astroBuffer.toString("utf8"));
    const diff = firstLineDifference(hugo.lines, astro.lines);
    if (!diff) html.identicalDom += 1;
    else difference("html-dom", url, diff);
    for (const key of ["title", "meta", "images", "links", "stylesheets"]) {
      if (JSON.stringify(hugo.facts[key]) !== JSON.stringify(astro.facts[key])) {
        difference(`html-${key}`, url, { hugo: hugo.facts[key], astro: astro.facts[key] });
      }
    }
    // Hugo의 defer와 Astro의 type=module은 둘 다 문서 파싱 뒤 실행되므로 같은 것으로 봅니다.
    const modes = (scripts) => scripts.filter((script) => script.startsWith("asset:"));
    const hugoModes = modes(hugo.facts.scripts);
    const astroModes = modes(astro.facts.scripts);
    if (JSON.stringify(hugoModes) !== JSON.stringify(astroModes)) {
      difference("script-execution", url, { hugo: hugoModes, astro: astroModes });
    }
    continue;
  }
  if (file.endsWith(".xml") && hugoBuffer.includes("<rss")) {
    feeds.compared += 1;
    if (same) feeds.identicalBytes += 1;
    const left = rssItems(hugoBuffer.toString("utf8"));
    const right = rssItems(astroBuffer.toString("utf8"));
    feeds.items += left.length;
    if (JSON.stringify(left) !== JSON.stringify(right)) difference("rss-items", url, { hugo: left.length, astro: right.length });
    if (!same) difference("file-bytes", url);
    continue;
  }
  if (!same) difference("file-bytes", url);
}
report.summary.identicalBytes = identicalBytes;
report.summary.html = html;
report.summary.feeds = feeds;

const hugoSitemap = (await readFile(join(HUGO, "sitemap.xml"), "utf8"));
const astroSitemap = (await readFile(join(ASTRO, "sitemap.xml"), "utf8"));
/** sitemap의 <url>별 loc→lastmod 맵을 만듭니다. */
const sitemapEntries = (xml) => new Map(tagValues(xml, "url").map((entry) => [tagValues(entry, "loc")[0].replace(/&#43;/g, "+"), tagValues(entry, "lastmod")[0] ?? ""]));
const hugoLocs = sitemapEntries(hugoSitemap);
const astroLocs = sitemapEntries(astroSitemap);
for (const [loc, lastmod] of hugoLocs) {
  if (!astroLocs.has(loc)) difference("sitemap-only-hugo", loc);
  else if (astroLocs.get(loc) !== lastmod) difference("sitemap-lastmod", loc, { hugo: lastmod, astro: astroLocs.get(loc) });
}
for (const loc of astroLocs.keys()) if (!hugoLocs.has(loc)) difference("sitemap-only-astro", loc);
const hugoOrder = [...hugoLocs.keys()];
const astroOrder = [...astroLocs.keys()].filter((loc) => hugoLocs.has(loc));
if (JSON.stringify(hugoOrder) !== JSON.stringify(astroOrder)) difference("sitemap-order", "/sitemap.xml");
report.summary.sitemap = { hugo: hugoLocs.size, astro: astroLocs.size };

const hugoIndex = JSON.parse(await readFile(join(HUGO, "index.json"), "utf8"));
const astroIndex = JSON.parse(await readFile(join(ASTRO, "index.json"), "utf8"));
if (JSON.stringify(hugoIndex) !== JSON.stringify(astroIndex)) difference("index-json", "/index.json");
report.summary.indexJson = { hugo: hugoIndex.length, astro: astroIndex.length };
report.summary.differences = report.differences.length;
report.summary.allowed = report.allowed.length;

if (jsonPath) await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
for (const item of report.allowed) console.log(`허용: [${item.kind}] ${item.subject} — ${item.reason}`);
for (const item of report.differences) {
  console.log(`차이: [${item.kind}] ${item.subject}`);
  if (item.detail) console.log(`  ${JSON.stringify(item.detail, null, 2).split("\n").join("\n  ")}`);
}
process.exitCode = report.differences.length ? 1 : 0;
