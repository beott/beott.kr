/** 섹션 RSS(`/posts/index.xml` 등). content 최상위 폴더마다 하나씩 만들고, 섹션 HTML 목록 페이지는 만들지 않습니다. */
import type { APIRoute, GetStaticPaths } from "astro";
import { renderRss } from "../../lib/feeds.mjs";
import { textResponse } from "../../lib/endpoints.mjs";
import { getSite, site } from "../../lib/site.mjs";

export const getStaticPaths: GetStaticPaths = async () => (
  (await getSite()).sections.map((section) => ({ params: { section: section.url.slice(1, -1) }, props: { url: section.url } }))
);

export const GET: APIRoute = async ({ props }) => {
  const section = (await getSite()).sections.find((candidate) => candidate.url === props.url);
  if (!section) throw new Error(`섹션을 찾을 수 없습니다: ${props.url}`);
  return textResponse(renderRss(site, section), "application/rss+xml");
};
