/** 사이트 검색 색인(`/index.json`). 공개 글과 소개·문의만 포함합니다. */
import type { APIRoute } from "astro";
import { goJsonify, plainSearchBody } from "../lib/hugo.mjs";
import { textResponse } from "../lib/endpoints.mjs";
import { searchEntries } from "../lib/site-model.mjs";
import { getSite } from "../lib/site.mjs";

export const GET: APIRoute = async () => textResponse(goJsonify(searchEntries(await getSite(), plainSearchBody)), "application/json");
