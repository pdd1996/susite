import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const revisionPath = resolve(
  process.cwd(),
  process.env.SITE_REVISION_PATH ?? "fixtures/jinyuan.revision.json"
);
const revision = JSON.parse(readFileSync(revisionPath, "utf8")) as {
  siteId?: unknown;
  revision?: unknown;
  config?: unknown;
};
const assetMapPath = process.env.SITE_ASSET_MAP_PATH
  ? resolve(process.cwd(), process.env.SITE_ASSET_MAP_PATH)
  : undefined;
const assetUrls = assetMapPath
  ? (JSON.parse(readFileSync(assetMapPath, "utf8")) as Record<string, string>)
  : {};
if (!revision.config || typeof revision.config !== "object") {
  throw new Error(`Revision config is missing: ${revisionPath}`);
}

export default defineConfig({
  define: {
    __SITE_CONFIG__: JSON.stringify(revision.config),
    __SITE_REVISION__: JSON.stringify({
      siteId: revision.siteId,
      revision: revision.revision
    }),
    __ASSET_URLS__: JSON.stringify(assetUrls)
  },
  build: {
    outDir: process.env.BUILD_OUT_DIR
      ? resolve(process.cwd(), process.env.BUILD_OUT_DIR)
      : "dist",
    emptyOutDir: true
  }
});
