/**
 * Hugo TOML front matter(`+++`)를 글 옆 JSON sidecar로 옮기는 1회성 변환 스크립트입니다.
 *
 * 사용법: node scripts/convert-front-matter.mjs [content 디렉터리]
 * - `<slug>.md`에는 본문만 남기고, 메타데이터는 `<slug>.json`에 키 순서·값을 그대로 기록합니다.
 * - 이미 front matter가 없는 파일은 건너뜁니다(재실행해도 안전).
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse } from "smol-toml";

const FRONT_MATTER = /^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+\r?\n?/;

/** 디렉터리 아래 모든 Markdown 파일 경로를 재귀로 모읍니다. */
async function listMarkdown(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdown(path);
    return entry.name.endsWith(".md") ? [path] : [];
  }));
  return nested.flat();
}

/** TOML 값을 JSON으로 옮길 수 있는 형태로 바꿉니다. 날짜 리터럴은 원문 문자열로 보존합니다. */
function toJsonValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
  }
  return value;
}

const root = resolve(process.argv[2] || "content");
let converted = 0;
for (const path of await listMarkdown(root)) {
  const source = await readFile(path, "utf8");
  const match = source.match(FRONT_MATTER);
  if (!match) continue;
  const data = toJsonValue(parse(match[1]));
  await writeFile(path.replace(/\.md$/, ".json"), `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(path, source.slice(match[0].length));
  converted += 1;
}
console.log(`변환한 파일: ${converted}`);
