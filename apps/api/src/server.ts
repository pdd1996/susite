import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { InMemorySiteRepository } from "./repository.js";
import { createMySqlRepository } from "./mysql-repository.js";

const port = Number(process.env.PORT ?? 8787);
const repository = process.env.DATABASE_URL
  ? createMySqlRepository(process.env.DATABASE_URL)
  : new InMemorySiteRepository();
if (process.env.NODE_ENV === "production") {
  throw new Error("Production startup is disabled until trusted IDaaS authentication is implemented.");
}
const actorId = process.env.DEV_ACTOR_ID;
if (!actorId) {
  throw new Error("DEV_ACTOR_ID is required. This Phase 1 server does not accept client-supplied identities.");
}
const app = createApp(repository, {
  actorId,
  allowedOrigin: process.env.ADMIN_ORIGIN
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`ZhanSite API listening on http://localhost:${port} (${process.env.DATABASE_URL ? "MySQL" : "in-memory"})`);
});
