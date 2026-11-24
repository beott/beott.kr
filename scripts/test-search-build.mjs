/** 실제 Astro 빌드와 외부 콘텐츠 fixture로 검색 색인의 공개 정책·갱신과 주요 출력을 검증합니다. */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { JEKYLL_DEFAULT_EXCLUDES, isExcludedByPages, isSpecialForJekyll, readPagesExclude } from "./pages-exclude.mjs";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// macOS의 /var → /private/var 심볼릭 링크 때문에 Vite 모듈 경로가 어긋나지 않도록 실제 경로를 씁니다.
const temporary = await realpath(await mkdtemp(join(tmpdir(), "beott-search-build-")));
const fixture = join(temporary, "site");
const output = join(fixture, "dist");
await mkdir(fixture);
for (const path of ["astro.config.mjs", "package.json", "src", "assets", "public", "content"]) {
  await cp(join(source, path), join(fixture, path), { recursive: true });
}
await symlink(join(source, "node_modules"), join(fixture, "node_modules"), "dir");

/** 저장소에 산출물을 쓰지 않고 격리된 Astro 빌드를 실행합니다. */
function build() {
  const result = spawnSync(process.execPath, [join(source, "node_modules/astro/bin/astro.mjs"), "build", "--root", fixture], {
    cwd: fixture,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

/** 생성된 JSON 배열을 읽어 경로 중복을 확인합니다. */
async function index() {
  const entries = JSON.parse(await readFile(join(output, "index.json"), "utf8"));
  assert.ok(Array.isArray(entries));
  assert.equal(new Set(entries.map((entry) => entry.href)).size, entries.length);
  return entries;
}

/** 격리한 콘텐츠 디렉터리에 검증용 글(md 본문 + json 메타데이터)을 추가합니다. */
async function post(name, data = {}, body = "초기 본문 고유검증어") {
  await writeFile(join(fixture, `content/posts/${name}.json`), JSON.stringify({ title: name, ...data }, null, 2));
  await writeFile(join(fixture, `content/posts/${name}.md`), `${body}\n`);
}

try {
  const log = build();
  await writeFile(join(temporary, "build.log"), log);
  const entries = await index();
  assert.equal(entries.length, 45);
  assert.ok(entries.some((entry) => entry.href === "/about/"));
  assert.ok(entries.some((entry) => entry.href === "/contact-us/"));
  assert.ok(entries.every((entry) => entry.href.startsWith("/posts/") || ["/about/", "/contact-us/"].includes(entry.href)));
  assert.ok(entries.some((entry) => entry.body.includes("스탠딩 코미디언")));
  const home = await readFile(join(output, "index.html"), "utf8");
  const detail = await readFile(join(output, "posts/1/kingdom-1/index.html"), "utf8");
  const search = await readFile(join(output, "search/index.html"), "utf8");
  assert.ok(home.includes("hero-link") && home.includes("main-swiper"));
  assert.ok(detail.includes("copy-button") && detail.includes("post-contents"));
  assert.ok(search.includes('data-mode="page"') && search.includes('name="q"'));
  for (const html of [home, detail, search]) {
    for (const landmark of ["header", "main", "footer"]) assert.equal((html.match(new RegExp(`<${landmark}\\b`, "g")) || []).length, 1);
    for (const match of html.matchAll(/(?:src|href)="(\/(?!\/)[^"?#]+\.(?:js|css))"/g)) {
      assert.ok((await stat(join(output, match[1]))).isFile());
    }
    assert.ok(/\/js\/search\.[\w-]+\.js/.test(html), "검색 스크립트 번들");
  }
  const rss = await readFile(join(output, "index.xml"), "utf8");
  const sitemap = await readFile(join(output, "sitemap.xml"), "utf8");
  assert.ok(rss.includes("<rss") && rss.includes("/posts/"));
  assert.ok(!rss.includes("/search/"), "검색 페이지는 RSS 목록에서 제외");
  assert.ok(sitemap.includes("<loc>https://beott.kr/search/</loc>"), "검색 페이지는 sitemap에 포함");
  assert.equal((sitemap.match(/<loc>/g) || []).length, 57);
  const notFound = await readFile(join(output, "404.html"), "utf8");
  assert.ok(notFound.includes('<meta name="robots" content="noindex">'), "404 페이지는 noindex");
  assert.ok(notFound.includes('href="/"') && notFound.includes('href="/search/"'), "404 페이지는 홈·검색 링크");
  assert.ok(notFound.includes("<title>BEOTT | 페이지를 찾을 수 없습니다</title>"));
  for (const html of [home, detail, search]) assert.ok(!html.includes('name="robots"'), "일반 페이지는 noindex 없음");
  assert.ok(!sitemap.includes("/404") && !rss.includes("/404"), "404 페이지는 sitemap·RSS에서 제외");
  assert.ok(!entries.some((entry) => entry.href.includes("/404")), "404 페이지는 검색 색인에서 제외");
  // GitHub Pages(Jekyll) exclude가 실제 산출물을 지우지 않는지 확인합니다.
  const pagesExclude = readPagesExclude(await readFile(join(source, "_config.yml"), "utf8"));
  const outputFiles = (await readdir(output, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(output, join(entry.parentPath, entry.name)));
  assert.deepEqual(outputFiles.filter((path) => isExcludedByPages(pagesExclude, path)), [], "Pages exclude와 겹치는 산출물");
  // Jekyll이 기본으로 건너뛰는 이름(`_astro/`, 점 파일 등)이나 기본 exclude 목록과 겹치는 산출물도 없어야 합니다.
  assert.deepEqual(outputFiles.filter(isSpecialForJekyll), [], "Jekyll이 건너뛰는 _·. 이름의 산출물");
  assert.deepEqual(outputFiles.filter((path) => isExcludedByPages(JEKYLL_DEFAULT_EXCLUDES, path)), [], "Jekyll 기본 exclude와 겹치는 산출물");
  for (const feed of ["posts", "categories", "tags", "tags/apple-tv+", "tags/netflix"]) {
    assert.ok((await readFile(join(output, feed, "index.xml"), "utf8")).includes("<rss"), `${feed} RSS`);
  }
  for (const page of ["tags/index.html", "categories/index.html", "posts/index.html", "tags/netflix/index.html", "tags/apple-tv+/index.html"]) {
    const html = await readFile(join(output, page), "utf8");
    assert.ok(html.includes("<article") && (html.includes("page-list") || html.includes("collection-empty")), `${page} HTML 목록`);
  }
  assert.match(home, /property="og:title" content="BEOTT"/);
  assert.ok(!home.includes('property="og:title" content>'), "홈 OG 제목은 비어 있지 않음");
  assert.ok(!detail.includes("beott.kr//images"), "글 OG 이미지는 슬래시가 하나");
  assert.ok(!detail.includes('content="비옽 BEOTT"'), "글 OG 설명은 본문 요약");
  assert.ok(home.includes('class="visually-hidden"') && home.includes("<h1"), "홈에 숨긴 h1");
  assert.ok(home.includes("srcset=") && home.includes('fetchpriority="high"'), "홈 썸네일은 반응형 img");
  assert.ok(home.includes("issue-shortcuts"), "호별 바로가기는 빌드에 포함");
  assert.ok(entries.find((entry) => entry.href === "/contact-us/").body.includes("mag.beott@gmail.com"));
  for (const entry of entries) await stat(join(output, entry.href, "index.html"));
  const raw = await readFile(join(output, "index.json"));
  const metrics = { entries: entries.length, rawBytes: raw.length, gzipBytes: gzipSync(raw).length };
  await writeFile(join(temporary, "metrics.json"), JSON.stringify(metrics, null, 2));
  await cp(output, join(temporary, "baseline"), { recursive: true });

  await post("search-draft", { draft: true });
  await post("search-future", { publishDate: "2999-01-01T00:00:00Z" });
  await post("search-future-date", { date: "2999-01-01T00:00:00+09:00" });
  await post("search-expired", { expiryDate: "2000-01-01T00:00:00Z" });
  await post("search-hideme", { hideme: true });
  await post("search-hidden", { hidden: true });
  await post("search-headless", { build: { list: "never", render: "never" } });
  await post("search-public", { filmTitle: "<작품명>" }, "첫문단 &amp; 엔티티\n\n둘째문단<br>줄바꿈\n\n고유검증어");
  build();
  const withFixtures = await index();
  assert.equal(withFixtures.length, 46);
  const added = withFixtures.find((entry) => entry.href === "/posts/search-public/");
  assert.equal(added.filmTitle, "<작품명>");
  assert.ok(added.body.includes("첫문단 & 엔티티"));
  assert.match(added.body, /둘째문단\s+줄바꿈/);
  assert.ok(!withFixtures.some((entry) => /search-(?:draft|future|expired|hideme|hidden|headless)/.test(entry.href)));
  for (const hidden of ["search-draft", "search-future", "search-future-date", "search-expired", "search-headless"]) {
    await assert.rejects(stat(join(output, "posts", hidden, "index.html")), `${hidden}는 페이지를 만들지 않음`);
  }
  await stat(join(output, "posts/search-hideme/index.html"));
  await post("search-public", {}, "수정후본문재색인");
  build();
  assert.ok((await index()).find((entry) => entry.href === "/posts/search-public/").body.includes("수정후본문재색인"));
  // 빈 공개 색인도 null이 아닌 JSON 배열로 출력되어야 합니다.
  await rm(join(fixture, "content"), { recursive: true });
  await mkdir(join(fixture, "content"));
  build();
  assert.deepEqual(await index(), []);
  console.log(JSON.stringify({ outcome: "passed", temporary, ...metrics }, null, 2));
} catch (error) {
  console.error(`검증 산출물: ${temporary}`);
  throw error;
}
