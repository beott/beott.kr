/** 태그별 RSS(`/tags/<태그>/index.xml`). 태그 경로는 Hugo urlize 규칙(예: `apple-tv+`)을 따릅니다. */
import type { APIRoute, GetStaticPaths } from "astro";
import { renderRss } from "../../../lib/feeds.mjs";
import { textResponse } from "../../../lib/endpoints.mjs";
import { getSite, site } from "../../../lib/site.mjs";

export const getStaticPaths: GetStaticPaths = async () => {
  const tags = (await getSite()).taxonomies.find((candidate) => candidate.name === "tags");
  return (tags?.terms ?? []).map((term) => ({ params: { tag: term.slug }, props: { url: term.url } }));
};

export const GET: APIRoute = async ({ props }) => {
  const term = (await getSite()).taxonomies.flatMap((taxonomy) => taxonomy.terms).find((candidate) => candidate.url === props.url);
  if (!term) throw new Error(`태그를 찾을 수 없습니다: ${props.url}`);
  return textResponse(renderRss(site, term), "application/rss+xml");
};
