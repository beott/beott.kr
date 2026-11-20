/** 홈 RSS(`/index.xml`). */
import type { APIRoute } from "astro";
import { renderRss } from "../lib/feeds.mjs";
import { textResponse } from "../lib/endpoints.mjs";
import { getSite, site } from "../lib/site.mjs";

export const GET: APIRoute = async () => textResponse(renderRss(site, (await getSite()).home), "application/rss+xml");
