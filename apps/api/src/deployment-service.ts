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
    private readonly publisher: PreviewPublisher
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

  async runNext(): Promise<boolean> {
    const deployment = await this.repository.claimNextDeployment(
      new Date(Date.now() + 10 * 60 * 1000).toISOString()
    );
    if (!deployment) return false;
    try {
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
      const assets = validation.assets;
      const inputChecksum = createHash("sha256")
        .update(
          JSON.stringify({
            config: revision.config,
            assets: assets
              .map(({ assetId, checksumSha256 }) => ({ assetId, checksumSha256 }))
              .sort((a, b) => a.assetId.localeCompare(b.assetId)),
            templateVersion
          })
        )
        .digest("hex");
      const artifactId = `artifact_${createHash("sha256")
        .update(`${deployment.siteId}:${revision.revision}:${templateVersion}:${inputChecksum}`)
        .digest("hex")
        .slice(0, 32)}`;
      const location =
        `artifacts/${deployment.siteId}/r${revision.revision}/${templateVersion}/${artifactId}`;
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
          createdAt: new Date().toISOString()
        },
        new Date(Date.now() + 10 * 60 * 1000).toISOString()
      );
      if (!claim.claimed && claim.artifact.status !== "ready") {
        await this.repository.updateDeployment(deployment.siteId, deployment.jobId, { status: "queued" });
        return false;
      }
      let artifact = claim.artifact;
      if (claim.claimed) {
        await this.publisher.buildAndStore({
          artifactPrefix: location,
          revision,
          assetUrls: Object.fromEntries(assets.map((asset) => [asset.assetId, asset.url]))
        });
        const readyArtifact = await this.repository.markArtifactReady(artifactId);
        if (!readyArtifact) throw new Error("artifact_reservation_lost");
        artifact = readyArtifact;
      }
      await this.repository.updateDeployment(deployment.siteId, deployment.jobId, {
        artifactId: artifact.artifactId,
        status: "deploying",
        leaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });
      const previewUrl = await this.publisher.publish(
        artifact.location,
        deployment.siteId,
        Object.fromEntries(assets.map((asset) => [asset.assetId, asset.url]))
      );
      await this.repository.updateDeployment(deployment.siteId, deployment.jobId, {
        artifactId: artifact.artifactId,
        status: "healthy",
        previewUrl
      });
      return true;
    } catch (error) {
      await this.repository.updateDeployment(deployment.siteId, deployment.jobId, {
        status: "failed",
        errorSummary: error instanceof Error ? error.message.slice(0, 500) : "deployment_failed"
      });
      return true;
    }
  }
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
