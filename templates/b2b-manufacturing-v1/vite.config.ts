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
if (!revision.config || typeof revision.config !== "object") {
  throw new Error(`Revision config is missing: ${revisionPath}`);
}

export default defineConfig({
  define: {
    __SITE_CONFIG__: JSON.stringify(revision.config),
    __SITE_REVISION__: JSON.stringify({
      siteId: revision.siteId,
      revision: revision.revision
    })
  }
});
