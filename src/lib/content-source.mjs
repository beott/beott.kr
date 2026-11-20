/**
 * `content/` 아래 `<slug>.md`(본문) + `<slug>.json`(메타데이터) 쌍을 읽고 검증합니다.
 * Astro content loader와 테스트·비교 스크립트가 함께 사용합니다.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { z } from "astro/zod";

const dateString = z.string().regex(
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?$/,
  "날짜는 `2024-11-04T00:00:00+09:00` 형식이어야 합니다.",
);

/** 글·페이지 메타데이터(JSON sidecar) 스키마입니다. 알 수 없는 키도 그대로 보존합니다. */
export const pageSchema = z.looseObject({
  title: z.string().min(1),
  draft: z.boolean().optional(),
  hideme: z.boolean().optional(),
  hidden: z.boolean().optional(),
  author: z.string().optional(),
  filmTitle: z.string().optional(),
  date: dateString.optional(),
  publishDate: dateString.optional(),
  expiryDate: dateString.optional(),
  lastmod: dateString.optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  thumbnail: z.string().optional(),
  group: z.string().optional(),
  type: z.string().optional(),
  build: z.looseObject({
    list: z.enum(["always", "local", "never"]).optional(),
    render: z.enum(["always", "link", "never"]).optional(),
  }).optional(),
});

/** 디렉터리 아래 JSON sidecar 경로를 재귀로 모읍니다. `content/images` 같은 비콘텐츠는 없다고 가정합니다. */
async function listJson(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listJson(path);
    return entry.name.endsWith(".json") ? [path] : [];
  }));
  return nested.flat();
}

/**
 * content 디렉터리의 모든 md+json 쌍을 읽습니다.
 * 반환값: [{ id: "posts/2/Evil-Genius", data, body }] (id는 확장자 없는 상대 경로, `/` 구분)
 */
export async function readContentEntries(contentDir) {
  const files = (await listJson(contentDir)).sort();
  return Promise.all(files.map(async (jsonPath) => {
    const id = relative(contentDir, jsonPath).split(sep).join("/").replace(/\.json$/, "");
    const markdownPath = jsonPath.replace(/\.json$/, ".md");
    let raw;
    try {
      raw = JSON.parse(await readFile(jsonPath, "utf8"));
    } catch (error) {
      throw new Error(`${jsonPath}: JSON을 읽지 못했습니다. ${error.message}`);
    }
    const parsed = pageSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`${jsonPath}: 메타데이터가 올바르지 않습니다.\n${z.prettifyError(parsed.error)}`);
    }
    let body;
    try {
      body = await readFile(markdownPath, "utf8");
    } catch (error) {
      throw new Error(`${jsonPath}: 짝이 되는 본문 파일(${markdownPath})이 없습니다. ${error.message}`);
    }
    return { id, data: parsed.data, body };
  }));
}
