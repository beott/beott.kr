/** Astro 페이지·엔드포인트가 함께 쓰는 사이트 모델 로더입니다. */
import { getCollection } from "astro:content";
import site from "../data/site.json";
import { buildSite } from "./site-model.mjs";

let cached;

/** content collection으로 사이트 모델을 만듭니다. 정적 빌드에서는 한 번만 계산합니다. */
export function getSite() {
  if (cached && import.meta.env.PROD) return cached;
  cached = getCollection("pages").then((entries) => buildSite(
    entries.map((entry) => ({ id: entry.id, data: entry.data, body: entry.body ?? "" })),
    { site },
  ));
  return cached;
}

export { site };
