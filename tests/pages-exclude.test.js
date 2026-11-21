import { describe, expect, test } from "@jest/globals";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isExcludedByPages, isSpecialForJekyll, readPagesExclude } from "../scripts/pages-exclude.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const jekyllFixture = join(root, "tests/fixtures/pages-jekyll");
const patterns = readPagesExclude(readFileSync(join(root, "_config.yml"), "utf8"));

/** 디렉터리 아래 모든 파일의 상대 경로를 모읍니다. */
function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)));
}

/** generated-paths.txt의 루트 산출물 이름(glob은 예시 이름으로 바꿈)입니다. */
const generatedRoots = readFileSync(join(root, "scripts/generated-paths.txt"), "utf8")
  .split("\n")
  .filter((line) => line.trim() && !line.startsWith("#"))
  .map((line) => line.trim().replace(/\/$/, "").replace(/\*/g, "x"));

/** 배포 후 서빙돼야 하는 대표 경로(중첩 이름이 소스 디렉터리와 같은 경우 포함)입니다. */
const servedPaths = [
  "404.html",
  "index.html",
  "index.json",
  "index.xml",
  "sitemap.xml",
  "robots.txt",
  "manifest.json",
  "favicon.ico",
  "CNAME",
  "css/index.abc123.css",
  "js/search.abc123.js",
  "js/sw.js",
  "font/NanumSquareNeoTTF-bRg.woff2",
  "images/1/kingdom-thumbnail.webp",
  "images/public/a.webp",
  "images/assets/a.webp",
  "images/content/a.webp",
  "posts/index.xml",
  "posts/1/kingdom-1/index.html",
  "posts/content/index.html",
  "tags/index.xml",
  "tags/apple-tv+/index.xml",
  "categories/index.xml",
  "about/index.html",
  "contact-us/index.html",
  "search/index.html",
  ...generatedRoots,
  ...listFiles(join(root, "public")),
];

describe("GitHub Pages exclude 규칙", () => {
  // Jekyll처럼 최상위 기준 + 접두사 일치로 판단한다
  test("matches like Jekyll entry filter", () => {
    expect(isExcludedByPages(["public"], "public/robots.txt")).toBe(true);
    expect(isExcludedByPages(["public"], "publicity.html")).toBe(true);
    expect(isExcludedByPages(["public"], "images/public/a.webp")).toBe(false);
    expect(isExcludedByPages(["*.md"], "content/posts/a.md")).toBe(true);
    expect(isExcludedByPages(["README.md"], "docs/README.md")).toBe(false);
  });

  // 내부 문서·소스·도구 파일은 배포 사이트에 올라가지 않아야 한다
  test.each([
    "AGENTS.md",
    "README.md",
    "Makefile",
    "package.json",
    "package-lock.json",
    "astro.config.mjs",
    "tsconfig.json",
    "content/about.json",
    "content/posts/3/westworld.md",
    "public/robots.txt",
    "assets/sass/index.scss",
    "assets/js/search-core.js",
    "src/pages/index.astro",
    "scripts/build.sh",
    "tests/site-model.test.js",
    "node_modules/astro/package.json",
  ])("excludes internal path %s", (path) => {
    expect(isExcludedByPages(patterns, path)).toBe(true);
  });

  // 사이트 산출물과 커스텀 도메인 파일은 그대로 서빙되어야 한다
  test("keeps every served output path", () => {
    expect(servedPaths.filter((path) => isExcludedByPages(patterns, path))).toEqual([]);
  });
});

/** fixture 텍스트 파일을 줄 단위 목록으로 읽습니다. */
function readLines(name) {
  return readFileSync(join(jekyllFixture, name), "utf8").split("\n").filter(Boolean);
}

/**
 * 실제 GitHub Pages 빌더(ghcr.io/actions/jekyll-build-pages:v1.0.13, Jekyll 3.10.0)의 결과로 에뮬레이터를 검증합니다.
 * source-files.txt는 커밋 932ac70의 트리, site-*-config.txt는 같은 트리를 old/new-config.yml로만 바꿔 빌드한 _site 목록입니다.
 */
describe("실제 Jekyll 결과와 에뮬레이터 대조", () => {
  const sources = readLines("source-files.txt");
  const configs = {
    old: { patterns: readPagesExclude(readFileSync(join(jekyllFixture, "old-config.yml"), "utf8")), site: new Set(readLines("site-old-config.txt")) },
    new: { patterns: readPagesExclude(readFileSync(join(jekyllFixture, "new-config.yml"), "utf8")), site: new Set(readLines("site-new-config.txt")) },
  };

  /** source 파일이 _site에 남기는 경로 후보(Markdown은 .html로 렌더링됨)입니다. */
  const outputsOf = (path) => (path.endsWith(".md") ? [path, path.replace(/\.md$/, ".html")] : [path]);
  /** 에뮬레이터가 예측한 제외 source 목록입니다. */
  const predictedExcluded = ({ patterns }) => sources.filter((path) => isSpecialForJekyll(path) || isExcludedByPages(patterns, path));
  /** 실제 _site에 아무 출력도 남지 않은 source 목록입니다. */
  const actualExcluded = ({ site }) => sources.filter((path) => !outputsOf(path).some((output) => site.has(output)));

  // old/new 설정 모두 예측한 제외 source 집합이 실제 Jekyll 결과와 같아야 한다
  test.each(["old", "new"])("predicts excluded sources for %s config", (name) => {
    expect(predictedExcluded(configs[name])).toEqual(actualExcluded(configs[name]));
  });

  // 설정만 바꿨을 때 실제로 사라진 _site 파일이 예측과 정확히 같아야 한다(244개)
  test("predicts removed site files between configs", () => {
    const removedSources = new Set(predictedExcluded(configs.new));
    for (const path of predictedExcluded(configs.old)) removedSources.delete(path);
    const predicted = [...removedSources].flatMap(outputsOf).filter((path) => configs.old.site.has(path)).sort();
    const actual = [...configs.old.site].filter((path) => !configs.new.site.has(path)).sort();
    expect(actual).toHaveLength(244);
    expect(predicted).toEqual(actual);
  });

  // fixture의 new 설정은 현재 _config.yml과 같아야 대조 결과가 지금 설정을 검증한다
  test("uses the current exclude list", () => {
    expect(configs.new.patterns).toEqual(patterns);
  });
});
