/** posts 섹션 RSS(`/posts/index.xml`). */
import type { APIRoute } from "astro";
import { renderRss } from "../../lib/feeds.mjs";
import { textResponse } from "../../lib/endpoints.mjs";
import { getSite, site } from "../../lib/site.mjs";

export const GET: APIRoute = async () => {
  const section = (await getSite()).sections.find((candidate) => candidate.url === "/posts/");
  if (!section) throw new Error("posts 섹션이 없습니다.");
  return textResponse(renderRss(site, section), "application/rss+xml");
};
