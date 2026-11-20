/** 글·페이지 content collection. `content/` 아래 `<slug>.json` 메타데이터와 같은 이름의 `.md` 본문을 묶습니다. */
import { defineCollection } from "astro:content";
import type { Loader } from "astro/loaders";
import { join } from "node:path";
import { pageSchema, readContentEntries } from "./lib/content-source.mjs";

const CONTENT_DIR = join(process.cwd(), "content");

/** md+json 쌍을 읽어 store에 넣는 loader입니다. 개발 서버에서는 content/ 변경 시 다시 읽습니다. */
function sidecarLoader(): Loader {
  return {
    name: "beott-sidecar-loader",
    load: async ({ store, parseData, generateDigest, watcher, logger }) => {
      const sync = async () => {
        const entries = await readContentEntries(CONTENT_DIR);
        store.clear();
        for (const entry of entries) {
          const data = await parseData({ id: entry.id, data: entry.data });
          store.set({ id: entry.id, data, body: entry.body, digest: generateDigest({ data, body: entry.body }) });
        }
        logger.info(`content ${entries.length}개를 읽었습니다.`);
      };
      await sync();
      if (!watcher) return;
      watcher.add(CONTENT_DIR);
      const reload = (path: string) => {
        if (!path.startsWith(CONTENT_DIR) || !/\.(md|json)$/.test(path)) return;
        sync().catch((error) => logger.error(`content를 다시 읽지 못했습니다: ${error.message}`));
      };
      watcher.on("change", reload);
      watcher.on("add", reload);
      watcher.on("unlink", reload);
    },
  };
}

export const collections = {
  pages: defineCollection({ loader: sidecarLoader(), schema: pageSchema }),
};
