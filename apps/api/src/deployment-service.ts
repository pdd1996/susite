import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { validateAssetReferences } from "./asset-validation.js";
import type { ObjectStorage } from "./object-storage.js";
import type {
  Asset,
  Deployment,
  SiteRepository,
  SiteRevision
} from "./repository.js";

const execFileAsync = promisify(execFile);
const templateVersion = "1.0.0";

export class DeploymentValidationError extends Error {
  constructor(
    readonly code:
      | "site_not_found"
      | "revision_not_found"
      | "asset_validation_failed"
      | "preview_not_configured",
    readonly issues?: unknown
  ) {
    super(code);
    this.name = "DeploymentValidationError";
  }
}

export interface PreviewPublisher {
  buildAndStore(input: {
    artifactPrefix: string;
    revision: SiteRevision;
    assetUrls: Record<string, string>;
  }): Promise<void>;
  prepareRelease?(input: {
    artifactPrefix: string;
    releasePrefix: string;
    siteId: string;
  }): Promise<void>;
  verifyRelease?(
    releasePrefix: string,
    siteId: string,
    assetUrls?: Record<string, string>
  ): Promise<string>;
  publish(
    artifactPrefix: string,
    siteId: string,
    assetUrls?: Record<string, string>
  ): Promise<string>;
}

export class UnavailablePreviewPublisher implements PreviewPublisher {
  async buildAndStore(): Promise<void> {
    throw new DeploymentValidationError("preview_not_configured");
  }

  async publish(): Promise<string> {
    throw new DeploymentValidationError("preview_not_configured");
  }
}

export class TemplatePreviewPublisher implements PreviewPublisher {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly platformDomain: string,
    private readonly releaseHealthBaseUrl: string,
    private readonly workspaceRoot = resolve(process.cwd(), "../..")
  ) {}

  async buildAndStore(input: {
    artifactPrefix: string;
    revision: SiteRevision;
    assetUrls: Record<string, string>;
  }): Promise<void> {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "zhansite-build-"));
    const revisionPath = join(temporaryDirectory, "revision.json");
    const assetMapPath = join(temporaryDirectory, "asset-map.json");
    const outputDirectory = join(temporaryDirectory, "dist");
    try {
      await writeFile(revisionPath, JSON.stringify(input.revision), "utf8");
      await writeFile(assetMapPath, JSON.stringify(input.assetUrls), "utf8");
      await execFileAsync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
        "--filter",
        "@zhansite/b2b-manufacturing-v1",
        "build"
      ], {
        cwd: this.workspaceRoot,
        env: {
          ...process.env,
          SITE_REVISION_PATH: revisionPath,
          SITE_ASSET_MAP_PATH: assetMapPath,
          BUILD_OUT_DIR: outputDirectory
        },
        ...(process.platform === "win32" ? { shell: true } : {}),
        timeout: 5 * 60 * 1000
      });

      const files = await listFiles(outputDirectory);
      for (const file of files) {
        const key = `${input.artifactPrefix}/${file.path}`;
        await this.storage.write(key, contentTypeFor(file.path), file.content);
      }
      await this.storage.write(
        `${input.artifactPrefix}/manifest.json`,
        "application/json",
        Buffer.from(JSON.stringify(files.map(({ path }) => path)))
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async publish(
    artifactPrefix: string,
    siteId: string,
    assetUrls: Record<string, string> = {}
  ): Promise<string> {
    const manifest = JSON.parse(
      (await this.storage.read(`${artifactPrefix}/manifest.json`)).toString("utf8")
    ) as string[];
    const previewPrefix = `previews/${siteId}`;
    for (const path of manifest) {
      await this.storage.write(
        `${previewPrefix}/${path}`,
        contentTypeFor(path),
        await this.storage.read(`${artifactPrefix}/${path}`)
      );
    }
    const index = await this.storage.read(`${artifactPrefix}/index.html`);
    for (const route of ["products", "certifications", "about", "contact"]) {
      await this.storage.write(`${previewPrefix}/${route}/index.html`, "text/html; charset=utf-8", index);
    }

    const previewUrl = `https://${siteId}.preview.${this.platformDomain}`;
    await verifyPreviewHealth(previewUrl, fetch, Object.values(assetUrls));
    return previewUrl;
  }

  async prepareRelease(input: {
    artifactPrefix: string;
    releasePrefix: string;
    siteId: string;
  }): Promise<void> {
    const manifest = JSON.parse(
      (await this.storage.read(`${input.artifactPrefix}/manifest.json`)).toString("utf8")
    ) as string[];
    for (const path of manifest) {
      await this.storage.write(
        `${input.releasePrefix}/${path}`,
        contentTypeFor(path),
        await this.storage.read(`${input.artifactPrefix}/${path}`)
      );
    }
    const index = await this.storage.read(`${input.artifactPrefix}/index.html`);
    for (const route of ["products", "certifications", "about", "contact"]) {
      await this.storage.write(
        `${input.releasePrefix}/${route}/index.html`,
        "text/html; charset=utf-8",
        index
      );
    }
  }

  async verifyRelease(
    releasePrefix: string,
    siteId: string,
    assetUrls: Record<string, string> = {}
  ): Promise<string> {
    const candidateUrl = `${this.releaseHealthBaseUrl.replace(/\/+$/, "")}/${releasePrefix
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    await verifyPreviewHealth(candidateUrl, fetch, Object.values(assetUrls));
    return `https://${siteId}.preview.${this.platformDomain}`;
  }
}

export async function verifyPreviewHealth(
  previewUrl: string,
  fetcher: typeof fetch = fetch,
  additionalResourceUrls: string[] = []
): Promise<void> {
  let homepage = "";
  for (const path of ["/", "/products", "/certifications", "/about", "/contact"]) {
    const response = await fetcher(`${previewUrl}${path}`, { redirect: "follow" });
    if (!response.ok) throw new Error(`health_check_failed:${path}:${response.status}`);
    if (path === "/") homepage = await response.text();
  }

  const resourceUrls = new Set<string>();
  for (const resourceUrl of additionalResourceUrls) resourceUrls.add(resourceUrl);
  for (const match of homepage.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const reference = match[1];
    if (!reference || /^(?:#|data:|mailto:|tel:|javascript:)/i.test(reference)) continue;
    const resourceUrl = new URL(reference, `${previewUrl}/`);
    if (resourceUrl.protocol === "http:" || resourceUrl.protocol === "https:") {
      resourceUrls.add(resourceUrl.toString());
    }
  }
  for (const resourceUrl of resourceUrls) {
    const response = await fetcher(resourceUrl, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`health_check_failed:resource:${resourceUrl}:${response.status}`);
    }
  }
}

export class DeploymentService {
  constructor(
    private readonly repository: SiteRepository,
    private readonly publisher: PreviewPublisher,
    private readonly clock: { now(): Date } = { now: () => new Date() },
    private readonly faultHooks: { afterActivation?(): void | Promise<void> } = {}
  ) {}

  async create(
    siteId: string,
    revisionNumber: number,
    idempotencyKey: string,
    actorId: string
  ): Promise<{ deployment: Deployment; created: boolean }> {
    if (!(await this.repository.getSite(siteId))) {
      throw new DeploymentValidationError("site_not_found");
    }
    const revision = await this.repository.getRevision(siteId, revisionNumber);
    if (!revision) throw new DeploymentValidationError("revision_not_found");
    const validation = await validateAssetReferences(
      this.repository,
      siteId,
      revision.config,
      "deployment"
    );
    if (validation.issues.length > 0) {
      throw new DeploymentValidationError("asset_validation_failed", validation.issues);
    }

    const now = new Date().toISOString();
    const deployment: Deployment = {
      deploymentId: `deployment_${randomUUID()}`,
      jobId: `job_${randomUUID()}`,
      siteId,
      revision: revisionNumber,
      environment: "preview",
      idempotencyKey,
      status: "queued",
      kind: "publish",
      attemptCount: 0,
      maxAttempts: 3,
      placeholderAssetIds: validation.assets
        .filter((asset) => asset.sourceKind === "placeholder")
        .map((asset) => asset.assetId)
        .sort(),
      createdBy: actorId,
      createdAt: now,
      updatedAt: now
    };
    const result = await this.repository.createDeployment(deployment);
    return result;
  }

  async createRollback(
    siteId: string,
    artifactId: string,
    idempotencyKey: string,
    actorId: string
  ): Promise<{ deployment: Deployment; created: boolean }> {
    if (!(await this.repository.getSite(siteId))) {
      throw new DeploymentValidationError("site_not_found");
    }
    const artifact = await this.repository.getArtifact(siteId, artifactId);
    if (!artifact || artifact.status !== "ready") {
      throw new DeploymentValidationError("revision_not_found");
    }
    const now = this.clock.now().toISOString();
    const deployment: Deployment = {
      deploymentId: `deployment_${randomUUID()}`,
      jobId: `job_${randomUUID()}`,
      siteId,
      revision: artifact.revision,
      artifactId,
      targetArtifactId: artifactId,
      kind: "rollback",
      environment: "preview",
      idempotencyKey,
      status: "queued",
      attemptCount: 0,
      maxAttempts: 3,
      placeholderAssetIds: [],
      createdBy: actorId,
      createdAt: now,
      updatedAt: now
    };
    const result = await this.repository.createDeployment(deployment);
    if (result.created) {
      await this.repository.recordAudit(actorId, "rollback.requested", siteId, result.deployment.deploymentId);
    }
    return result;
  }

  async runNext(): Promise<boolean> {
    return this.runNextReliably();
  }

  private async runNextReliably(): Promise<boolean> {
    const now = this.clock.now();
    const exhausted = await this.repository.failExpiredDeployments(now.toISOString());
    for (const deployment of exhausted) {
      await this.repository.appendDeploymentEvent({
        deploymentId: deployment.deploymentId,
        siteId: deployment.siteId,
        attempt: deployment.attemptCount ?? deployment.maxAttempts ?? 3,
        stage: "failed",
        level: "error",
        code: "attempts_exhausted",
        message: "Worker 租约在最大重试次数后过期，任务已终止"
      });
      await this.repository.recordAudit(
        deployment.createdBy,
        "deployment.failed",
        deployment.siteId,
        deployment.deploymentId
      );
    }
    const deployment = await this.repository.claimNextDeployment(
      new Date(now.getTime() + 10 * 60 * 1000).toISOString()
    );
    if (!deployment) return exhausted.length > 0;
    const leaseToken = deployment.leaseToken;
    if (leaseToken === undefined) throw new Error("deployment_lease_token_missing");
    const attempt = deployment.attemptCount ?? 1;
    const appendEvent = async (
      stage: string,
      level: "info" | "warn" | "error",
      code: string,
      message: string
    ) => {
      await this.repository.appendDeploymentEvent({
        deploymentId: deployment.deploymentId,
        siteId: deployment.siteId,
        attempt,
        stage,
        level,
        code,
        message: sanitizeDeploymentMessage(message)
      });
    };

    await appendEvent("claimed", "info", "deployment_claimed", "任务已领取");
    try {
      const currentState = await this.repository.getPreviewState(deployment.siteId);
      if (
        currentState?.activeDeploymentId === deployment.deploymentId &&
        (!deployment.artifactId || currentState.activeArtifactId === deployment.artifactId)
      ) {
        const confirmed = await this.repository.updateDeployment(
          deployment.siteId,
          deployment.jobId,
          leaseToken,
          {
            artifactId: currentState.activeArtifactId,
            status: "healthy",
            previewUrl: currentState.previewUrl,
            errorSummary: undefined,
            lastErrorCode: undefined,
            lastErrorClass: undefined
          }
        );
        if (!confirmed) throw new Error("deployment_lease_lost");
        await appendEvent("activated", "info", "activation_confirmed", "已确认先前完成的原子激活");
        return true;
      }

      let artifact;
      let assets: Asset[] = [];
      if ((deployment.kind ?? "publish") === "rollback") {
        artifact = await this.repository.getArtifact(
          deployment.siteId,
          deployment.targetArtifactId ?? deployment.artifactId ?? ""
        );
        if (!artifact || artifact.status !== "ready") {
          throw new DeploymentValidationError("revision_not_found");
        }
      } else {
        const revision = await this.repository.getRevision(deployment.siteId, deployment.revision);
        if (!revision) throw new DeploymentValidationError("revision_not_found");
        const validation = await validateAssetReferences(
          this.repository,
          deployment.siteId,
          revision.config,
          "deployment"
        );
        if (validation.issues.length > 0) {
          throw new DeploymentValidationError("asset_validation_failed", validation.issues);
        }
        assets = validation.assets;
        const inputChecksum = createHash("sha256")
          .update(JSON.stringify({
            config: revision.config,
            assets: assets
              .map(({ assetId, checksumSha256 }) => ({ assetId, checksumSha256 }))
              .sort((left, right) => left.assetId.localeCompare(right.assetId)),
            templateVersion
          }))
          .digest("hex");
        const artifactId = `artifact_${createHash("sha256")
          .update(`${deployment.siteId}:${revision.revision}:${templateVersion}:${inputChecksum}`)
          .digest("hex")
          .slice(0, 32)}`;
        const location = `artifacts/${deployment.siteId}/r${revision.revision}/${templateVersion}/${artifactId}`;
        const claim = await this.repository.claimArtifact(
          {
            artifactId,
            siteId: deployment.siteId,
            revision: revision.revision,
            template: "b2b-manufacturing-v1",
            templateVersion,
            inputChecksum,
            location,
            status: "building",
            createdBy: deployment.createdBy,
            createdAt: this.clock.now().toISOString()
          },
          new Date(this.clock.now().getTime() + 10 * 60 * 1000).toISOString()
        );
        if (!claim.claimed && claim.artifact.status !== "ready") {
          throw new Error("artifact_temporarily_busy");
        }
        artifact = claim.artifact;
        if (claim.claimed) {
          await appendEvent("building", "info", "build_started", "开始构建不可变 artifact");
          await this.publisher.buildAndStore({
            artifactPrefix: location,
            revision,
            assetUrls: Object.fromEntries(assets.map((asset) => [asset.assetId, asset.url]))
          });
          if (artifact.leaseToken === undefined) throw new Error("artifact_lease_token_missing");
          const ready = await this.repository.markArtifactReady(artifact.artifactId, artifact.leaseToken);
          if (!ready) throw new Error("artifact_reservation_lost");
          artifact = ready;
          await appendEvent("built", "info", "artifact_ready", "不可变 artifact 已就绪");
        }
      }

      const releasePrefix =
        `releases/${deployment.siteId}/${deployment.deploymentId}/${artifact.artifactId}`;
      const deploying = await this.repository.updateDeployment(
        deployment.siteId,
        deployment.jobId,
        leaseToken,
        {
          artifactId: artifact.artifactId,
          status: "deploying",
          leaseExpiresAt: new Date(this.clock.now().getTime() + 10 * 60 * 1000).toISOString()
        }
      );
      if (!deploying) throw new Error("deployment_lease_lost");
      const assetUrls = Object.fromEntries(assets.map((asset) => [asset.assetId, asset.url]));
      let previewUrl: string;
      if (this.publisher.prepareRelease && this.publisher.verifyRelease) {
        await this.publisher.prepareRelease({
          artifactPrefix: artifact.location,
          releasePrefix,
          siteId: deployment.siteId
        });
        await appendEvent("release_prepared", "info", "release_prepared", "不可变候选 release 已准备");
        previewUrl = await this.publisher.verifyRelease(releasePrefix, deployment.siteId, assetUrls);
      } else {
        previewUrl = await this.publisher.publish(artifact.location, deployment.siteId, assetUrls);
        await appendEvent("release_prepared", "info", "release_prepared", "候选 release 已准备");
      }
      await appendEvent("health_checked", "info", "health_check_passed", "候选 release 健康检查通过");

      const beforeActivation = await this.repository.getPreviewState(deployment.siteId);
      const activation = await this.repository.activatePreview({
        siteId: deployment.siteId,
        deploymentId: deployment.deploymentId,
        artifactId: artifact.artifactId,
        leaseToken,
        expectedVersion: beforeActivation?.version ?? 0,
        previewUrl,
        activatedAt: this.clock.now().toISOString()
      });
      if (activation === "lease_lost") throw new Error("deployment_lease_lost");
      if (activation === "activation_conflict") throw new Error("activation_conflict");
      await appendEvent("activated", "info", "activation_succeeded", "预览指针已原子激活");
      await this.faultHooks.afterActivation?.();
      const healthy = await this.repository.updateDeployment(
        deployment.siteId,
        deployment.jobId,
        leaseToken,
        {
          artifactId: artifact.artifactId,
          status: "healthy",
          previewUrl,
          errorSummary: undefined,
          lastErrorCode: undefined,
          lastErrorClass: undefined
        }
      );
      if (!healthy) throw new Error("deployment_lease_lost");
      await this.repository.recordAudit(
        deployment.createdBy,
        deployment.kind === "rollback" ? "rollback.activated" : "deployment.activated",
        deployment.siteId,
        deployment.deploymentId
      );
      return true;
    } catch (error) {
      const failure = classifyDeploymentError(error);
      const maxAttempts = deployment.maxAttempts ?? 3;
      const shouldRetry = failure.errorClass === "transient" && attempt < maxAttempts;
      const nextAttemptAt = shouldRetry
        ? new Date(this.clock.now().getTime() + retryDelayMs(attempt)).toISOString()
        : undefined;
      const updated = await this.repository.updateDeployment(
        deployment.siteId,
        deployment.jobId,
        leaseToken,
        {
          status: shouldRetry ? "retry_waiting" : "failed",
          errorSummary: failure.message,
          lastErrorCode: failure.code,
          lastErrorClass: failure.errorClass,
          nextAttemptAt
        }
      );
      if (updated) {
        await appendEvent(
          shouldRetry ? "retry_scheduled" : "failed",
          shouldRetry ? "warn" : "error",
          failure.code,
          failure.message
        );
        await this.repository.recordAudit(
          deployment.createdBy,
          shouldRetry ? "deployment.retry_scheduled" : "deployment.failed",
          deployment.siteId,
          deployment.deploymentId
        );
      }
      return true;
    }
  }
}

function retryDelayMs(attempt: number): number {
  return [1_000, 5_000, 30_000][Math.min(Math.max(attempt - 1, 0), 2)]!;
}

export function sanitizeDeploymentMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/([?&](?:signature|token|access[_-]?key|secret)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(?:access[_-]?key|secret|password|token)\s*[:=]\s*\S+/gi, "[redacted-secret]")
    .split(/\r?\n/)[0]!
    .slice(0, 500);
}

function classifyDeploymentError(error: unknown): {
  code: string;
  errorClass: "transient" | "permanent" | "concurrency";
  message: string;
} {
  const raw = error instanceof Error ? error.message : "deployment_failed";
  const message = sanitizeDeploymentMessage(raw);
  if (error instanceof DeploymentValidationError) {
    return { code: error.code, errorClass: "permanent", message: error.code };
  }
  if (/lease_lost|reservation_lost|activation_conflict/i.test(raw)) {
    return {
      code: /activation_conflict/i.test(raw) ? "activation_conflict" : "lease_lost",
      errorClass: "concurrency",
      message: "并发控制已拒绝过期操作"
    };
  }
  if (/health_check_failed.*:4\d\d|authorization|forbidden|invalid|not_configured/i.test(raw)) {
    return { code: "permanent_failure", errorClass: "permanent", message };
  }
  const code = /health_check_failed/i.test(raw)
    ? "health_check_failed"
    : /artifact_temporarily_busy/i.test(raw)
      ? "artifact_temporarily_busy"
      : /storage|object|network|timeout|ECONN|build/i.test(raw)
        ? "transient_infrastructure_failure"
        : "deployment_failed";
  return { code, errorClass: "transient", message };
}

async function listFiles(root: string): Promise<Array<{ path: string; content: Buffer }>> {
  const result: Array<{ path: string; content: Buffer }> = [];
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else {
        result.push({
          path: relative(root, absolute).replaceAll("\\", "/"),
          content: await readFile(absolute)
        });
      }
    }
  };
  await walk(root);
  return result;
}

function contentTypeFor(path: string): string {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".pdf": "application/pdf"
  }[extname(path).toLowerCase()] ?? "application/octet-stream";
}
