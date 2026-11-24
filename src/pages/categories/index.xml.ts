/** categories taxonomy RSS(`/categories/index.xml`). HTML 목록은 `index.astro`가 만들고, 이 파일은 피드를 유지합니다. */
import type { APIRoute } from "astro";
import { renderRss } from "../../lib/feeds.mjs";
import { textResponse } from "../../lib/endpoints.mjs";
import { getSite, site } from "../../lib/site.mjs";

export const GET: APIRoute = async () => {
  const taxonomy = (await getSite()).taxonomies.find((candidate) => candidate.name === "categories");
  if (!taxonomy) throw new Error("categories taxonomy가 없습니다.");
  return textResponse(renderRss(site, taxonomy), "application/rss+xml");
};
