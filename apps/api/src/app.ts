import { Hono } from "hono";
import { cors } from "hono/cors";
import { CreateRevisionSchema, CreateSiteSchema } from "@zhansite/site-config";
import { SiteAlreadyExistsError, type SiteRepository } from "./repository.js";

type AppOptions = {
  actorId: string;
  allowedOrigin?: string;
};

export function createApp(repository: SiteRepository, options: AppOptions) {
  const app = new Hono();
  app.use("*", cors({ origin: options.allowedOrigin ?? "http://localhost:5173" }));
  app.onError((error, context) => {
    if (error instanceof SyntaxError) return context.json({ error: "invalid_json" }, 400);
    console.error(error);
    return context.json({ error: "internal_error" }, 500);
  });

  app.get("/sites", async (context) => context.json(await repository.listSites()));

  app.post("/sites", async (context) => {
    const parsed = CreateSiteSchema.safeParse(await context.req.json());
    if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);

    try {
      const site = await repository.createSite(parsed.data, options.actorId);
      return context.json(site, 201);
    } catch (error) {
      if (error instanceof SiteAlreadyExistsError) {
        return context.json({ error: "site_already_exists" }, 409);
      }
      throw error;
    }
  });

  app.get("/sites/:siteId", async (context) => {
    const site = await repository.getSite(context.req.param("siteId"));
    return site ? context.json(site) : context.json({ error: "site_not_found" }, 404);
  });

  app.get("/sites/:siteId/revisions", async (context) => {
    const siteId = context.req.param("siteId");
    if (!(await repository.getSite(siteId))) return context.json({ error: "site_not_found" }, 404);
    return context.json(await repository.getRevisions(siteId));
  });

  app.post("/sites/:siteId/revisions", async (context) => {
    const parsed = CreateRevisionSchema.safeParse(await context.req.json());
    if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);

    const result = await repository.createRevision(
      context.req.param("siteId"),
      parsed.data.expectedRevision,
      parsed.data.config,
      options.actorId
    );

    if (result.kind === "not_found") return context.json({ error: "site_not_found" }, 404);
    if (result.kind === "conflict") {
      return context.json({ error: "revision_conflict", currentRevision: result.currentRevision }, 409);
    }
    return context.json(result.revision, 201);
  });

  return app;
}
