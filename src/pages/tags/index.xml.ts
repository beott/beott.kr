/** tags taxonomy RSS(`/tags/index.xml`). 글 목록 HTML 페이지는 만들지 않습니다(기존 URL 동작 유지). */
import type { APIRoute } from "astro";
import { renderRss } from "../../lib/feeds.mjs";
import { textResponse } from "../../lib/endpoints.mjs";
import { getSite, site } from "../../lib/site.mjs";

export const GET: APIRoute = async () => {
  const taxonomy = (await getSite()).taxonomies.find((candidate) => candidate.name === "tags");
  if (!taxonomy) throw new Error("tags taxonomy가 없습니다.");
  return textResponse(renderRss(site, taxonomy), "application/rss+xml");
};
