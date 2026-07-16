import "./load-env.js";
import { setTimeout as delay } from "node:timers/promises";
import { DeploymentService } from "./deployment-service.js";
import { createRuntimeInfrastructure } from "./runtime.js";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the independent deployment worker.");
  }

  const { repository, publisher, hasOssConfig } = createRuntimeInfrastructure();
  if (
    !hasOssConfig ||
    !process.env.PLATFORM_DOMAIN ||
    !process.env.PREVIEW_RELEASE_HEALTH_BASE_URL
  ) {
    await repository.close?.();
    throw new Error(
      "The independent deployment worker requires complete OSS_* configuration, PLATFORM_DOMAIN and PREVIEW_RELEASE_HEALTH_BASE_URL."
    );
  }

  const pollIntervalMs = parsePollInterval(process.env.DEPLOYMENT_WORKER_POLL_MS);
  const deploymentService = new DeploymentService(repository, publisher);
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log(`Deployment worker started (poll interval: ${pollIntervalMs}ms)`);
  try {
    while (!stopping) {
      while (!stopping && await deploymentService.runNext()) {
        // Drain runnable jobs before waiting for the next poll.
      }
      if (!stopping) await delay(pollIntervalMs);
    }
  } finally {
    await repository.close?.();
  }
}

function parsePollInterval(value: string | undefined): number {
  if (!value) return 1_000;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 60_000) {
    throw new Error("DEPLOYMENT_WORKER_POLL_MS must be an integer between 100 and 60000.");
  }
  return parsed;
}

void main().catch((error) => {
  console.error("Deployment worker failed to start", error);
  process.exitCode = 1;
});
