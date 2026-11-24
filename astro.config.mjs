// @ts-check
/** 비옽 BEOTT Astro 설정. 산출물은 dist/에 만들고 scripts/build.sh가 repo 루트로 복사합니다. */
import { defineConfig } from "astro/config";
import { optimizeImagesIntegration } from "./src/lib/responsive-images.mjs";

/**
 * 번들 파일을 Hugo 때처럼 css/·js/ 아래에 둡니다.
 * repo 루트의 소스 디렉터리(assets/ 등)와 겹치지 않고, GitHub Pages(Jekyll)가 무시하는 `_`로 시작하지 않게 합니다.
 */
const assetFileNames = (/** @type {{ names?: string[] }} */ asset) => (
  asset.names?.some((name) => name.endsWith(".css")) ? "css/[name].[hash][extname]" : "media/[name].[hash][extname]"
);

/** `<script>`로 불러온 assets/js 파일 이름(header·search·post)을 번들 이름으로 씁니다. */
const scriptFileNames = (/** @type {{ name: string, moduleIds?: string[] }} */ chunk) => {
  const source = [...(chunk.moduleIds ?? [])]
    .reverse()
    .map((id) => id.match(/assets\/js\/([\w-]+)\.js$/)?.[1])
    .find((name) => name && name !== "search-core");
  return `js/${source ?? chunk.name.replace(/[^\w-]/g, "_")}.[hash].js`;
};

const output = { assetFileNames, entryFileNames: scriptFileNames, chunkFileNames: scriptFileNames };

export default defineConfig({
  site: "https://beott.kr",
  integrations: [optimizeImagesIntegration()],
  trailingSlash: "ignore",
  devToolbar: { enabled: false },
  // Hugo 출력처럼 인라인 요소 사이 공백(예: 제목과 작성자 사이)을 유지한다.
  compressHTML: false,
  build: {
    format: "directory",
    inlineStylesheets: "never",
  },
  vite: {
    // Hugo(Dart Sass + 공백 제거 minify)처럼 Sass 압축 출력만 쓰고, 선언 재배치·media 문법 변환을 하는 lightningcss 압축은 끈다.
    css: { preprocessorOptions: { scss: { style: "compressed" } } },
    build: {
      cssMinify: false,
      assetsInlineLimit: 0,
      rolldownOptions: { output: { assetFileNames } },
    },
    environments: {
      client: { build: { rolldownOptions: { output } } },
    },
  },
});
