/** sitemap(`/sitemap.xml`). 기존 Hugo 목록에 빠져 있던 `/search/`도 포함합니다. */
import type { APIRoute } from "astro";
import { renderSitemap } from "../lib/feeds.mjs";
import { textResponse } from "../lib/endpoints.mjs";
import { getSite, site } from "../lib/site.mjs";

export const GET: APIRoute = async () => textResponse(renderSitemap(site, (await getSite()).sitemapPages), "application/xml");
