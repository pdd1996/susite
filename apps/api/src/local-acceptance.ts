import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import type { SiteConfig } from "@zhansite/site-config";
import { createApp } from "./app.js";
import { DeploymentService, type PreviewPublisher } from "./deployment-service.js";
import type { SiteRevision } from "./repository.js";
import { InMemorySiteRepository } from "./repository.js";

const execFileAsync = promisify(execFile);
const siteId = "phase2-local-acceptance";
const runCount = 20;
const localThresholdMs = 10 * 60 * 1_000;
const approvedAt = "2026-07-16T20:59:07+08:00";
const workspaceRoot = resolve(process.cwd(), "../..");
const logoPath = join(workspaceRoot, "apps/api/fixtures/jinyuan-example-logo.svg");

const config: SiteConfig = {
  brand: {
    name: "杭州金源电器有限公司",
    primaryColor: "#C41E3A",
    logoAssetId: "asset_local_placeholder_logo"
  },
  contact: { phone: "0571-86817925", address: "杭州市莫干山路1418号" },
  assets: { certificates: [] },
  home: {
    hero: { title: "杭州金源电器有限公司", summary: "专注互感器研发制造" },
    principles: ["以质量求生存"],
    strengths: ["国标生产"],
    featuredCategoryIds: ["lv-current"]
  },
  products: {
    categories: [{
      id: "lv-current",
      slug: "lv-current",
      name: "低压电流互感器",
      summary: "适用于低压配电",
      series: [{ id: "lmk1-bh", name: "LMK1(BH)-0.66", sellingPoint: "免拆线安装" }]
    }]
  },
  certifications: { groups: [] },
  about: {
    introduction: "专业生产互感器产品。",
    principles: ["以质量求生存"],
    industries: ["电网"]
  }
};

class LocalStaticPublisher implements PreviewPublisher {
  buildCount = 0;
  private readonly artifactDirectories = new Map<string, string>();

  constructor(
    private readonly artifactRoot: string,
    private readonly staticRoot: string,
    private readonly baseUrl: string
  ) {}

  async buildAndStore(input: {
    artifactPrefix: string;
    revision: SiteRevision;
    assetUrls: Record<string, string>;
  }): Promise<void> {
    const inputDirectory = await mkdtemp(join(tmpdir(), "zhansite-local-input-"));
    const outputDirectory = join(
      this.artifactRoot,
      createHash("sha256").update(input.artifactPrefix).digest("hex")
    );
    try {
      await writeFile(join(inputDirectory, "revision.json"), JSON.stringify(input.revision), "utf8");
      await writeFile(join(inputDirectory, "asset-map.json"), JSON.stringify(input.assetUrls), "utf8");
      await execFileAsync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
        "--filter",
        "@zhansite/b2b-manufacturing-v1",
        "build"
      ], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          SITE_REVISION_PATH: join(inputDirectory, "revision.json"),
          SITE_ASSET_MAP_PATH: join(inputDirectory, "asset-map.json"),
          BUILD_OUT_DIR: outputDirectory
        },
        ...(process.platform === "win32" ? { shell: true } : {}),
        timeout: 5 * 60 * 1_000
      });
      this.artifactDirectories.set(input.artifactPrefix, outputDirectory);
      this.buildCount += 1;
    } finally {
      await rm(inputDirectory, { recursive: true, force: true });
    }
  }

  async publish(
    artifactPrefix: string,
    publishedSiteId: string,
    assetUrls: Record<string, string> = {}
  ): Promise<string> {
    const artifactDirectory = this.artifactDirectories.get(artifactPrefix);
    if (!artifactDirectory) throw new Error("local_artifact_missing");

    const siteDirectory = join(this.staticRoot, publishedSiteId);
    await rm(siteDirectory, { recursive: true, force: true });
    await cp(artifactDirectory, siteDirectory, { recursive: true });
    const indexPath = join(siteDirectory, "index.html");
    for (const route of ["products", "certifications", "about", "contact"]) {
      const routeDirectory = join(siteDirectory, route);
      await mkdir(routeDirectory, { recursive: true });
      await copyFile(indexPath, join(routeDirectory, "index.html"));
    }
    await cp(join(siteDirectory, "assets"), join(this.staticRoot, "assets"), {
      recursive: true,
      force: true
    });

    const previewUrl = `${this.baseUrl}/${publishedSiteId}`;
    await verifyStaticPreview(previewUrl, Object.values(assetUrls));
    return previewUrl;
  }
}

async function main(): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "zhansite-local-acceptance-"));
  const staticRoot = join(temporaryRoot, "static");
  const artifactRoot = join(temporaryRoot, "artifacts");
  await mkdir(staticRoot, { recursive: true });
  await mkdir(artifactRoot, { recursive: true });
  const staticServer = await startStaticServer(staticRoot);

  try {
    const logo = await readFile(logoPath);
    const logoChecksum = createHash("sha256").update(logo).digest("hex");
    await mkdir(join(staticRoot, "assets"), { recursive: true });
    await writeFile(join(staticRoot, "assets", "jinyuan-example-logo.svg"), logo);

    const repository = new InMemorySiteRepository();
    const publisher = new LocalStaticPublisher(artifactRoot, staticRoot, staticServer.baseUrl);
    const deploymentService = new DeploymentService(repository, publisher);
    // This only creates an in-process Hono handler; no API network listener is started.
    const app = createApp(repository, { actorId: "Pan", deploymentService });
    const assetUrl = `${staticServer.baseUrl}/assets/jinyuan-example-logo.svg`;

    const createSite = await app.request("/sites", {
      method: "POST",
      body: JSON.stringify({
        siteId,
        name: "Phase 2 本地验收站点",
        template: "b2b-manufacturing-v1",
        config
      })
    });
    assertStatus(createSite, 201, "create_site");

    await repository.createAsset({
      assetId: "asset_local_placeholder_logo",
      siteId,
      type: "logo",
      status: "verified",
      sourceKind: "placeholder",
      placeholderApprovedBy: "Pan",
      placeholderApprovedAt: approvedAt,
      objectKey: `assets/${siteId}/asset_local_placeholder_logo/${logoChecksum}`,
      url: assetUrl,
      contentType: "image/svg+xml",
      sizeBytes: logo.byteLength,
      checksumSha256: logoChecksum,
      originalFilename: "jinyuan-example-logo.svg",
      createdBy: "Pan",
      verifiedBy: "Pan",
      createdAt: approvedAt,
      verifiedAt: approvedAt
    });

    const durations: number[] = [];
    const jobs: Array<{ run: number; revision: number; jobId: string; artifactId?: string; previewUrl?: string }> = [];
    let revision = 1;
    for (let run = 1; run <= runCount; run += 1) {
      if (run > 1) {
        const revisionResponse = await app.request(`/sites/${siteId}/revisions`, {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: revision,
            config: {
              ...config,
              home: {
                ...config.home,
                hero: {
                  ...config.home.hero,
                  summary: `${config.home.hero.summary}（本地验收第 ${run} 次）`
                }
              }
            }
          })
        });
        assertStatus(revisionResponse, 201, `create_revision_${run}`);
        revision += 1;
      }

      const startedAt = performance.now();
      const response = await app.request(`/sites/${siteId}/deployments`, {
        method: "POST",
        body: JSON.stringify({ revision, idempotencyKey: `local-acceptance-${run}` })
      });
      assertStatus(response, 202, `create_deployment_${run}`);
      const created = await response.json() as { jobId: string; placeholderAssetIds: string[] };
      if (!created.placeholderAssetIds.includes("asset_local_placeholder_logo")) {
        throw new Error(`placeholder_not_reported:${run}`);
      }
      if (!await deploymentService.runNext()) throw new Error(`deployment_not_claimed:${run}`);
      const statusResponse = await app.request(`/sites/${siteId}/deployments/${created.jobId}`);
      assertStatus(statusResponse, 200, `deployment_status_${run}`);
      const status = await statusResponse.json() as {
        status: string;
        artifactId?: string;
        previewUrl?: string;
        errorSummary?: string;
      };
      if (status.status !== "healthy") {
        throw new Error(`deployment_not_healthy:${run}:${status.status}:${status.errorSummary ?? "unknown"}`);
      }
      if (status.previewUrl !== `${staticServer.baseUrl}/${siteId}`) {
        throw new Error(`unexpected_preview_url:${run}`);
      }
      durations.push(performance.now() - startedAt);
      jobs.push({ run, revision, jobId: created.jobId, artifactId: status.artifactId, previewUrl: status.previewUrl });
    }

    const sorted = [...durations].sort((left, right) => left - right);
    const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    if (p95Ms > localThresholdMs) throw new Error(`local_p95_exceeded:${p95Ms}`);
    if (publisher.buildCount !== runCount) {
      throw new Error(`actual_build_count_mismatch:${publisher.buildCount}`);
    }

    console.log(JSON.stringify({
      acceptanceMode: "local_http_mock",
      acceptedBy: "Pan",
      acceptedAt: new Date().toISOString(),
      runCount,
      actualBuildCount: publisher.buildCount,
      p95Ms: Number(p95Ms.toFixed(2)),
      thresholdMs: localThresholdMs,
      allHealthy: true,
      staticHttpBaseUrl: staticServer.baseUrl,
      routes: ["/", "/products", "/certifications", "/about", "/contact"],
      placeholderAsset: {
        path: relative(workspaceRoot, logoPath).replaceAll("\\", "/"),
        sizeBytes: logo.byteLength,
        checksumSha256: logoChecksum
      },
      sampleJob: jobs.at(-1),
      deferredExternalEvidence: [
        "real_oss",
        "public_dns_and_tls",
        "cloud_p95",
        "public_wechat_device_test"
      ]
    }, null, 2));
  } finally {
    await staticServer.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function verifyStaticPreview(previewUrl: string, additionalResourceUrls: string[]): Promise<void> {
  let homepage = "";
  for (const path of ["/", "/products", "/certifications", "/about", "/contact"]) {
    const response = await fetch(`${previewUrl}${path}`);
    if (!response.ok) throw new Error(`static_health_check_failed:${path}:${response.status}`);
    const body = await response.text();
    if (!body.includes('id="root"')) {
      throw new Error(`static_html_shell_missing:${path}`);
    }
    if (path === "/") homepage = body;
  }

  const resourceUrls = new Set(additionalResourceUrls);
  for (const match of homepage.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const reference = match[1];
    if (!reference || /^(?:#|data:|mailto:|tel:|javascript:)/i.test(reference)) continue;
    resourceUrls.add(new URL(reference, `${previewUrl}/`).toString());
  }
  for (const resourceUrl of resourceUrls) {
    const response = await fetch(resourceUrl);
    if (!response.ok) throw new Error(`static_resource_missing:${resourceUrl}:${response.status}`);
  }
}

async function startStaticServer(root: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      const filePath = resolveStaticPath(root, pathname);
      if (!filePath) {
        response.writeHead(404).end();
        return;
      }
      const file = await readFile(filePath);
      response.writeHead(200, { "content-type": contentTypeFor(filePath) }).end(file);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("local_static_server_address_missing");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server)
  };
}

function resolveStaticPath(root: string, pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) return undefined;
  const relativePath = segments.length === 0
    ? join(siteId, "index.html")
    : segments[0] === "assets"
      ? join(...segments)
      : join(...segments, "index.html");
  const candidate = resolve(root, relativePath);
  if (!candidate.startsWith(`${resolve(root)}${process.platform === "win32" ? "\\" : "/"}`)) {
    return undefined;
  }
  return candidate;
}

function contentTypeFor(path: string): string {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml"
  }[extname(path).toLowerCase()] ?? "application/octet-stream";
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => error ? reject(error) : resolvePromise());
  });
}

function assertStatus(response: Response, expected: number, operation: string): void {
  if (response.status !== expected) {
    throw new Error(`${operation}:expected_${expected}:received_${response.status}`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
