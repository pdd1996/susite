import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { InMemorySiteRepository } from "./repository.js";
import { createMySqlRepository } from "./mysql-repository.js";
import {
  DeploymentService,
  TemplatePreviewPublisher,
  UnavailablePreviewPublisher
} from "./deployment-service.js";
import { AliOssObjectStorage, InMemoryObjectStorage } from "./object-storage.js";
import { UploadService } from "./upload-service.js";

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
const ossConfigValues = [
  process.env.OSS_REGION,
  process.env.OSS_BUCKET,
  process.env.OSS_ACCESS_KEY_ID,
  process.env.OSS_ACCESS_KEY_SECRET,
  process.env.OSS_PUBLIC_BASE_URL
];
const hasAnyOssConfig = ossConfigValues.some(Boolean);
const hasOssConfig = ossConfigValues.every(Boolean);
if (hasAnyOssConfig && !hasOssConfig) {
  throw new Error("OSS configuration is incomplete; configure every required OSS_* variable.");
}
const uploadTokenSecret = process.env.UPLOAD_TOKEN_SECRET;
if (hasOssConfig && (!uploadTokenSecret || uploadTokenSecret.length < 32)) {
  throw new Error("UPLOAD_TOKEN_SECRET must contain at least 32 characters when OSS is enabled.");
}
const objectStorage = hasOssConfig
  ? new AliOssObjectStorage({
      region: process.env.OSS_REGION!,
      bucket: process.env.OSS_BUCKET!,
      accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
      publicBaseUrl: process.env.OSS_PUBLIC_BASE_URL!,
      ...(process.env.OSS_ENDPOINT ? { endpoint: process.env.OSS_ENDPOINT } : {})
    })
  : new InMemoryObjectStorage();
const uploadService = new UploadService(
  repository,
  objectStorage,
  uploadTokenSecret ?? "local-development-upload-secret"
);
const publisher =
  hasOssConfig && process.env.PLATFORM_DOMAIN
    ? new TemplatePreviewPublisher(objectStorage, process.env.PLATFORM_DOMAIN)
    : new UnavailablePreviewPublisher();
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
void runDeploymentWorker();
setInterval(() => void runDeploymentWorker(), 1_000).unref();
