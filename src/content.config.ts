/** 글·페이지 content collection. `content/` 아래 `<slug>.json` 메타데이터와 같은 이름의 `.md` 본문을 묶습니다. */
import { defineCollection } from "astro:content";
import type { Loader } from "astro/loaders";
import { fileURLToPath } from "node:url";
import { pageSchema, readContentEntries } from "./lib/content-source.mjs";

/** md+json 쌍을 읽어 store에 넣는 loader입니다. 개발 서버에서는 content/ 변경 시 다시 읽습니다. */
function sidecarLoader(): Loader {
  return {
    name: "beott-sidecar-loader",
    load: async ({ config, store, parseData, generateDigest, watcher, logger }) => {
      const contentDir = fileURLToPath(new URL("content/", config.root)).replace(/\/$/, "");
      const sync = async () => {
        const entries = await readContentEntries(contentDir);
        store.clear();
        for (const entry of entries) {
          const data = await parseData({ id: entry.id, data: entry.data });
          store.set({ id: entry.id, data, body: entry.body, digest: generateDigest({ data, body: entry.body }) });
        }
        logger.info(`content ${entries.length}개를 읽었습니다.`);
      };
      await sync();
      if (!watcher) return;
      watcher.add(contentDir);
      const reload = (path: string) => {
        if (!path.startsWith(contentDir) || !/\.(md|json)$/.test(path)) return;
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
