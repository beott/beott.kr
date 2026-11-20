/**
 * Hugo 내장 RSS·sitemap 템플릿과 같은 XML 문자열을 만듭니다.
 * 공백·들여쓰기까지 기존 출력과 같게 맞춰 두 빌드를 바이트 단위로 비교할 수 있게 합니다.
 */
import {
  absolutizeXmlUrls,
  escapeTemplateText,
  escapeXmlText,
  formatIsoDate,
  formatRssDate,
  summarize,
} from "./hugo.mjs";

const XML_DECLARATION = '<?xml version="1.0" encoding="utf-8" standalone="yes"?>';

/** 사이트 기준 절대 주소를 만듭니다. */
export function permalink(site, url) {
  return `${site.baseURL.replace(/\/$/, "")}${url}`;
}

/** RSS item 하나를 만듭니다. 일반 글은 요약을, 목록 페이지(term)는 빈 설명을 씁니다. */
function rssItem(site, page) {
  const link = escapeTemplateText(permalink(site, page.url));
  const description = page.kind === "page" ? escapeXmlText(summarize(page.html)) : "";
  return [
    "\t\t\t<item>",
    `\t\t\t\t<title>${escapeTemplateText(page.title)}</title>`,
    `\t\t\t\t<link>${link}</link>`,
    `\t\t\t\t<pubDate>${formatRssDate(page.kind === "page" ? page.publishDate : page.date)}</pubDate>`,
    `\t\t\t\t<guid>${link}</guid>`,
    `\t\t\t\t<description>${description}</description>`,
    "\t\t\t</item>",
  ].join("\n");
}

/**
 * 목록 페이지(home·section·taxonomy·term)의 RSS를 만듭니다.
 * @param {object} site 사이트 설정
 * @param {object} listPage buildSite가 만든 목록 페이지
 */
export function renderRss(site, listPage) {
  const isHome = listPage.kind === "home";
  const channelTitle = isHome ? site.title : `${listPage.title} on ${site.title}`;
  const description = isHome ? `Recent content on ${site.title}` : `Recent content in ${listPage.title} on ${site.title}`;
  const lines = [
    XML_DECLARATION,
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "\t<channel>",
    `\t\t<title>${escapeTemplateText(channelTitle)}</title>`,
    `\t\t<link>${escapeTemplateText(permalink(site, listPage.url))}</link>`,
    `\t\t<description>${escapeTemplateText(description)}</description>`,
    "\t\t<generator>Hugo</generator>",
    `\t\t<language>${escapeTemplateText(site.languageCode)}</language>`,
    "\t\t",
    "\t\t",
    "\t\t",
    "\t\t",
  ];
  if (!listPage.date.zero) {
    lines.push(`\t\t\t<lastBuildDate>${formatRssDate(listPage.lastmod)}</lastBuildDate>`, "\t\t");
  }
  lines.push(`\t\t\t<atom:link href="${permalink(site, listPage.url)}index.xml" rel="self" type="application/rss+xml" />`);
  for (const page of listPage.pages) lines.push(rssItem(site, page));
  lines.push("\t</channel>", "</rss>", "");
  return absolutizeXmlUrls(lines.join("\n"), site.baseURL);
}

/** sitemap.xml을 만듭니다. lastmod가 없는 페이지(소개 등)는 lastmod를 생략합니다. */
export function renderSitemap(site, pages) {
  const urls = pages.map((page) => {
    const lastmod = page.lastmod.zero ? "" : `\n    <lastmod>${formatIsoDate(page.lastmod)}</lastmod>`;
    return `<url>\n    <loc>${escapeTemplateText(permalink(site, page.url))}</loc>${lastmod}\n  </url>`;
  });
  return [
    XML_DECLARATION,
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '  xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    `  ${urls.join("")}`,
    "</urlset>",
    "",
  ].join("\n");
}
