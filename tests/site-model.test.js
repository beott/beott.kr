import { describe, expect, test } from "@jest/globals";
import { buildSite, groupRows, heroPosts, searchEntries } from "../src/lib/site-model.mjs";
import { formatIsoDate, formatRssDate, parseDate, plainSearchBody, summarize, urlize } from "../src/lib/hugo.mjs";
import { renderRss, renderSitemap } from "../src/lib/feeds.mjs";

const site = { title: "BEOTT", baseURL: "https://beott.kr/", languageCode: "ko", main: ["A", "B"] };
const now = new Date("2026-01-01T00:00:00Z");

/** 테스트용 content 항목을 만듭니다. */
function entry(id, data = {}, body = "본문") {
  return { id, data: { title: id, ...data }, body };
}

describe("Hugo 호환 보조 함수", () => {
  // 날짜는 원래 시간대(+09:00)를 유지해 RSS·sitemap 형식으로 쓴다
  test("formats dates in their original offset", () => {
    const date = parseDate("2025-03-13T00:05:00+09:00");
    expect(formatRssDate(date)).toBe("Thu, 13 Mar 2025 00:05:00 +0900");
    expect(formatIsoDate(date)).toBe("2025-03-13T00:05:00+09:00");
    expect(formatRssDate(parseDate(undefined))).toBe("Mon, 01 Jan 0001 00:00:00 +0000");
  });

  // 태그·경로는 Hugo urlize 규칙(소문자, 공백→-, + 유지)
  test("urlizes tags and paths like Hugo", () => {
    expect(urlize("Apple TV+")).toBe("apple-tv+");
    expect(urlize("Dont-FxxK-with-Cats")).toBe("dont-fxxk-with-cats");
  });

  // 검색 본문은 블록 경계를 공백으로 바꾸고 엔티티를 풀되 NBSP는 남긴다
  test("extracts plain search body", () => {
    expect(plainSearchBody("<p>첫&amp;문단</p><p>둘째<br>줄&#160;끝</p>")).toBe("첫&문단 둘째 줄 끝");
  });

  // 자동 요약은 70단어에 도달한 문단에서 끝난다
  test("summarizes at the paragraph reaching 70 words", () => {
    const paragraph = `<p>${"단어 ".repeat(40).trim()}</p>\n`;
    expect(summarize(paragraph.repeat(3))).toBe(`${paragraph}${paragraph}`.trim());
  });
});

describe("사이트 모델", () => {
  const entries = [
    entry("about", { hideme: true }),
    entry("search", { type: "search", hideme: true, build: { list: "never" } }),
    entry("posts/1/Old", { date: "2024-01-01T00:00:00+09:00", group: "A", tags: ["Wavve"], thumbnail: "/images/old.webp" }),
    entry("posts/2/New", { date: "2025-01-01T00:00:00+09:00", group: "A", tags: ["WAVVE"], hideme: true }),
    entry("posts/2/Draft", { date: "2025-02-01T00:00:00+09:00", group: "B", draft: true }),
    entry("posts/2/Future", { date: "2099-01-01T00:00:00+09:00", group: "B" }),
  ];
  const model = buildSite(entries, { site, now });

  // draft·미래 글은 만들지 않고, 경로는 소문자 URL로 바뀐다
  test("excludes drafts and future posts and lowercases urls", () => {
    expect(model.rendered.map((page) => page.url).sort()).toEqual(["/about/", "/posts/1/old/", "/posts/2/new/", "/search/"]);
  });

  // 히어로는 hideme와 무관하게 최신순, 그룹 줄은 오래된 순이며 hideme 글을 숨긴다
  test("builds hero and group rows like the old landing template", () => {
    expect(heroPosts(model).map((page) => page.id)).toEqual(["posts/2/New", "posts/1/Old"]);
    expect(groupRows(model)).toEqual([{ group: "A", pages: [model.regularPages.find((page) => page.id === "posts/1/Old")] }]);
  });

  // 태그 제목은 파일 경로 순서로 처음 만난 표기를 쓴다
  test("uses the first spelling by file path for tag titles", () => {
    const tags = model.taxonomies.find((taxonomy) => taxonomy.name === "tags");
    expect(tags.terms.map((term) => [term.url, term.title, term.pages.length])).toEqual([["/tags/wavve/", "Wavve", 2]]);
    expect(renderRss(site, tags.terms[0])).toContain("<title>Wavve on BEOTT</title>");
  });

  // 검색 색인은 숨긴 글을 빼고 소개 페이지를 넣으며, sitemap에는 /search/도 들어간다
  test("builds search entries and sitemap", () => {
    expect(searchEntries(model, plainSearchBody).map((item) => item.href)).toEqual(["/posts/1/old/", "/about/"]);
    const sitemap = renderSitemap(site, model.sitemapPages);
    expect(sitemap).toContain("<loc>https://beott.kr/search/</loc>");
    expect(sitemap).toContain("<loc>https://beott.kr/tags/wavve/</loc>\n    <lastmod>2025-01-01T00:00:00+09:00</lastmod>");
  });
});
