import "./load-env.js";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { DeploymentService } from "./deployment-service.js";
import { createRuntimeInfrastructure } from "./runtime.js";
import { UploadService } from "./upload-service.js";

const port = Number(process.env.PORT ?? 8787);
if (process.env.NODE_ENV === "production") {
  throw new Error("Production startup is disabled until trusted IDaaS authentication is implemented.");
}
const actorId = process.env.DEV_ACTOR_ID;
if (!actorId) {
  throw new Error("DEV_ACTOR_ID is required. This Phase 1 server does not accept client-supplied identities.");
}
const { repository, objectStorage, publisher, hasOssConfig } = createRuntimeInfrastructure();
const uploadTokenSecret = process.env.UPLOAD_TOKEN_SECRET;
if (hasOssConfig && (!uploadTokenSecret || uploadTokenSecret.length < 32)) {
  throw new Error("UPLOAD_TOKEN_SECRET must contain at least 32 characters when OSS is enabled.");
}
const uploadService = new UploadService(
  repository,
  objectStorage,
  uploadTokenSecret ?? "local-development-upload-secret"
);
const deploymentService = new DeploymentService(repository, publisher);
const app = createApp(repository, {
  actorId,
  allowedOrigin: process.env.ADMIN_ORIGIN,
  objectStorage,
  uploadService,
  deploymentService
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`ZhanSite API listening on http://localhost:${port} (${process.env.DATABASE_URL ? "MySQL" : "in-memory"})`);
});

let workerRunning = false;
const runDeploymentWorker = async () => {
  if (workerRunning) return;
  workerRunning = true;
  try {
    while (await deploymentService.runNext()) {
      // Drain all immediately runnable jobs; leased artifact builds are retried by the next poll.
    }
  } catch (error) {
    console.error("Deployment worker failed", error);
  } finally {
    workerRunning = false;
  }
};
if (process.env.RUN_EMBEDDED_DEPLOYMENT_WORKER !== "false") {
  void runDeploymentWorker();
  setInterval(() => void runDeploymentWorker(), 1_000).unref();
}
