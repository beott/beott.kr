/** 실제 Hugo 출력과 외부 콘텐츠 fixture로 검색 색인의 공개 정책·갱신을 검증합니다. */
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "beott-search-build-"));
const fixture = join(temporary, "site");
await mkdir(fixture);
for (const path of ["hugo.toml", "layouts", "assets", "static", "content"]) {
  await cp(join(source, path), join(fixture, path), { recursive: true });
}

/** 저장소에 산출물을 쓰지 않고 격리된 Hugo 빌드를 실행합니다. */
function build(extra = []) {
  const result = spawnSync("hugo", [
    "--source", fixture,
    "--destination", join(temporary, "public"),
    "--cacheDir", join(temporary, "cache"),
    "--noBuildLock",
    ...extra,
  ], {
    env: { ...process.env, HUGO_RESOURCEDIR: join(temporary, "resources") },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

/** 생성된 JSON 배열을 읽어 경로 중복을 확인합니다. */
async function index() {
  const entries = JSON.parse(await readFile(join(temporary, "public/index.json"), "utf8"));
  assert.ok(Array.isArray(entries));
  assert.equal(new Set(entries.map((entry) => entry.href)).size, entries.length);
  return entries;
}

/** 격리한 콘텐츠 디렉터리에 검증용 글을 추가합니다. */
async function post(name, frontMatter = "", body = "초기 본문 고유검증어") {
  await writeFile(join(fixture, `content/posts/${name}.md`), `+++\ntitle = "${name}"\n${frontMatter}\n+++\n${body}\n`);
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
  const home = await readFile(join(temporary, "public/index.html"), "utf8");
  const detail = await readFile(join(temporary, "public/posts/1/kingdom-1/index.html"), "utf8");
  const search = await readFile(join(temporary, "public/search/index.html"), "utf8");
  assert.ok(home.includes("hero-link") && home.includes("main-swiper"));
  assert.ok(detail.includes("copy-button") && detail.includes("post-contents"));
  assert.ok(search.includes('data-mode="page"') && search.includes('name="q"'));
  for (const html of [home, detail, search]) {
    for (const landmark of ["header", "main", "footer"]) assert.equal((html.match(new RegExp(`<${landmark}\\b`, "g")) || []).length, 1);
    for (const match of html.matchAll(/(?:src|href)="(\/(?!\/)[^"?#]+\.(?:js|css))"/g)) {
      assert.ok((await stat(join(temporary, "public", match[1]))).isFile());
    }
    assert.ok(html.includes("search.js") || /search[.\w-]*\.js/.test(html));
  }
  const rss = await readFile(join(temporary, "public/index.xml"), "utf8");
  const sitemap = await readFile(join(temporary, "public/sitemap.xml"), "utf8");
  assert.ok(rss.includes("<rss") && rss.includes("/posts/"));
  assert.ok(!rss.includes("/search/") && !sitemap.includes("/search/"), "검색 페이지는 RSS·sitemap 목록에서 제외");
  assert.ok(entries.find((entry) => entry.href === "/contact-us/").body.includes("mag.beott@gmail.com"));
  for (const entry of entries) await stat(join(temporary, "public", entry.href, "index.html"));
  const raw = await readFile(join(temporary, "public/index.json"));
  const metrics = { entries: entries.length, rawBytes: raw.length, gzipBytes: gzipSync(raw).length };
  await writeFile(join(temporary, "metrics.json"), JSON.stringify(metrics, null, 2));
  await cp(join(temporary, "public"), join(temporary, "baseline"), { recursive: true });

  await post("search-draft", "draft = true");
  await post("search-future", 'publishDate = "2999-01-01T00:00:00Z"');
  await post("search-expired", 'expiryDate = "2000-01-01T00:00:00Z"');
  await post("search-hideme", "hideme = true");
  await post("search-hidden", "hidden = true");
  await post("search-headless", '[build]\nlist = "never"\nrender = "never"');
  await post("search-public", 'filmTitle = "<작품명>"', "첫문단 &amp; 엔티티\n\n둘째문단<br>줄바꿈\n\n고유검증어");
  build(["--buildDrafts", "--buildFuture", "--buildExpired"]);
  const withFixtures = await index();
  assert.equal(withFixtures.length, 46);
  const added = withFixtures.find((entry) => entry.href === "/posts/search-public/");
  assert.equal(added.filmTitle, "<작품명>");
  assert.ok(added.body.includes("첫문단 & 엔티티"));
  assert.match(added.body, /둘째문단\s+줄바꿈/);
  assert.ok(!withFixtures.some((entry) => /search-(?:draft|future|expired|hideme|hidden|headless)/.test(entry.href)));
  await post("search-public", "", "수정후본문재색인");
  build();
  assert.ok((await index()).find((entry) => entry.href === "/posts/search-public/").body.includes("수정후본문재색인"));
  await cp(join(source, "content"), join(temporary, "saved-content"), { recursive: true });
  // 빈 공개 색인도 null이 아닌 JSON 배열로 출력되어야 합니다.
  const { rm } = await import("node:fs/promises");
  await rm(join(fixture, "content"), { recursive: true });
  await mkdir(join(fixture, "content"));
  build();
  assert.deepEqual(await index(), []);
  console.log(JSON.stringify({ outcome: "passed", temporary, ...metrics }, null, 2));
} catch (error) {
  console.error(`검증 산출물: ${temporary}`);
  throw error;
}
