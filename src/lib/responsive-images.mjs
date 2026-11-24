/**
 * 홈·목록용 썸네일을 여러 폭의 WebP로 만듭니다.
 * 원본(`public/images/`)은 그대로 두고, 파생본은 `public/images/opt/`에 둡니다.
 */
import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const publicRoot = fileURLToPath(new URL("../../public", import.meta.url));
const imagesRoot = join(publicRoot, "images");
const outputRoot = join(imagesRoot, "opt");

/** 카드(16:9, 최대 약 2x 400px)와 히어로(뷰포트 전체)에 쓰는 폭입니다. */
export const CARD_WIDTHS = [400, 800];
export const HERO_WIDTHS = [800, 1280, 1920];
export const CARD_SIZES = "(min-width: 1500px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw";
export const HERO_SIZES = "100vw";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

/** `/images/...` 또는 `https://.../images/...`에서 사이트 내부 이미지 경로를 꺼냅니다. */
export function localImagePath(src) {
  const value = String(src ?? "").trim();
  if (!value) return "";
  try {
    const url = new URL(value, "https://beott.kr");
    if (url.pathname.startsWith("/images/")) return decodeURIComponent(url.pathname);
  } catch {
    return "";
  }
  return value.startsWith("/images/") ? value : "";
}

/** 원본 경로와 목표 폭으로 파생 WebP의 공개 URL을 만듭니다. */
export function optimizedUrl(src, width) {
  const local = localImagePath(src).replace(/^\/images\//, "");
  if (!local) return "";
  const base = local.replace(/\.[^/.]+$/, "");
  return `/images/opt/${base}-w${width}.webp`;
}

/** 원본 파일의 디스크 경로를 돌려줍니다. */
export function sourceFile(src) {
  const local = localImagePath(src);
  return local ? join(publicRoot, local.replace(/^\//, "")) : "";
}

/**
 * srcset 후보를 만듭니다. 실제 파일 폭은 생성 뒤에 채워질 수 있습니다.
 * @param {string} src
 * @param {number[]} widths
 * @param {{ url: string, width: number }[]} [variants]
 */
export function imageSrcset(src, widths, variants) {
  if (variants?.length) return variants.map((item) => `${item.url} ${item.width}w`).join(", ");
  return widths.map((width) => `${optimizedUrl(src, width)} ${width}w`).join(", ");
}

/** public/images 아래에서 썸네일 원본을 모두 찾습니다(opt·로고·배너는 제외). */
export async function listSourceThumbnails() {
  const found = [];
  async function walk(directory) {
    let entries = [];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "opt") continue;
        await walk(full);
        continue;
      }
      if (!IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      const rel = relative(imagesRoot, full);
      if (/^(beott-logo|main-banner|og-image|link)\b/i.test(rel) || rel.startsWith("opt/")) continue;
      found.push(`/images/${rel.split("\\").join("/")}`);
    }
  }
  await walk(imagesRoot);
  return found.sort();
}

/**
 * 한 원본을 요청한 폭의 WebP로 만듭니다. 이미 최신이면 다시 만들지 않습니다.
 * @returns {Promise<{ url: string, width: number }[]>}
 */
export async function ensureOptimized(src, widths) {
  const input = sourceFile(src);
  if (!input) return [];
  let sourceStat;
  try {
    sourceStat = await stat(input);
  } catch {
    return [];
  }
  if (!sourceStat.isFile()) return [];

  const sharp = (await import("sharp")).default;
  const metadata = await sharp(input).rotate().metadata();
  const sourceWidth = metadata.width || Math.max(...widths);
  // 원본이 작아도 srcset에 적은 폭의 파일은 모두 만든다(없는 URL을 광고하지 않기 위해).
  const variants = [];
  for (const requested of widths) {
    const target = Math.min(requested, sourceWidth);
    const url = optimizedUrl(src, requested);
    const output = join(publicRoot, url.replace(/^\//, ""));
    await mkdir(dirname(output), { recursive: true });
    let outputStat;
    try {
      outputStat = await stat(output);
    } catch {
      outputStat = null;
    }
    if (!outputStat || outputStat.mtimeMs < sourceStat.mtimeMs) {
      await sharp(input)
        .rotate()
        .resize({ width: target, withoutEnlargement: true })
        .webp({ quality: 75, effort: 4 })
        .toFile(output);
    }
    const written = await sharp(output).metadata();
    variants.push({ url, width: written.width || target });
  }
  return variants;
}

/** 카드·히어로에 필요한 폭을 한 번에 만듭니다. */
export async function ensureAllOptimized(sources = null) {
  const list = sources ?? await listSourceThumbnails();
  const unique = [...new Set(list.map(localImagePath).filter(Boolean))];
  const widths = [...new Set([...CARD_WIDTHS, ...HERO_WIDTHS])].sort((left, right) => left - right);
  const results = new Map();
  for (const src of unique) {
    results.set(src, await ensureOptimized(src, widths));
  }
  return results;
}

/** Astro 통합: dev 서버와 빌드 시작 전에 파생 이미지를 만듭니다. */
export function optimizeImagesIntegration() {
  return {
    name: "beott-optimize-images",
    hooks: {
      "astro:server:setup": async () => {
        await ensureAllOptimized();
      },
      "astro:build:start": async () => {
        await ensureAllOptimized();
      },
    },
  };
}
