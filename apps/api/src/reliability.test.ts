import { describe, expect, it } from "vitest";
import type { SiteConfig } from "@zhansite/site-config";
import { createApp } from "./app.js";
import { DeploymentService, type PreviewPublisher } from "./deployment-service.js";
import { InMemorySiteRepository } from "./repository.js";

const config: SiteConfig = {
  brand: { name: "可靠性站点", primaryColor: "#123456", logoAssetId: "asset_logo" },
  contact: { phone: "0571-12345678", address: "测试地址" },
  assets: { certificates: [] },
  home: {
    hero: { title: "可靠性站点", summary: "版本 A" },
    principles: ["可靠"],
    strengths: ["可恢复"],
    featuredCategoryIds: ["category"]
  },
  products: {
    categories: [{
      id: "category",
      slug: "category",
      name: "测试分类",
      summary: "摘要",
      series: [{ id: "series", name: "产品", sellingPoint: "稳定" }]
    }]
  },
  certifications: { groups: [] },
  about: { introduction: "介绍", principles: ["可靠"], industries: [] }
};

class FaultPublisher implements PreviewPublisher {
  failBuild = false;
  failPrepare = false;
  failHealth = false;
  onVerify?: () => void;

  async buildAndStore() {
    if (this.failBuild) throw new Error("build process timeout");
  }
  async prepareRelease() {
    if (this.failPrepare) throw new Error("object storage unavailable");
  }
  async verifyRelease(_prefix: string, siteId: string) {
    this.onVerify?.();
    if (this.failHealth) {
      throw new Error("storage timeout https://internal.example/release?token=secret\nprivate stack");
    }
    return `https://${siteId}.preview.test`;
  }
  async publish(_prefix: string, siteId: string) {
    return `https://${siteId}.preview.test`;
  }
}

async function seedSite(repository: InMemorySiteRepository, siteId: string) {
  await repository.createSite(
    { siteId, name: siteId, template: "b2b-manufacturing-v1" },
    config,
    "operator"
  );
  const now = new Date().toISOString();
  await repository.createAsset({
    assetId: `${siteId}_asset_logo`,
    siteId,
    type: "logo",
    status: "verified",
    sourceKind: "customer_provided",
    objectKey: `assets/${siteId}/logo`,
    url: "https://assets.example/logo.png",
    contentType: "image/png",
    sizeBytes: 8,
    checksumSha256: "a".repeat(64),
    originalFilename: "logo.png",
    createdBy: "operator",
    verifiedBy: "operator",
    createdAt: now,
    verifiedAt: now
  });
  const siteConfig = {
    ...config,
    brand: { ...config.brand, logoAssetId: `${siteId}_asset_logo` }
  };
  await repository.createRevision(siteId, 1, siteConfig, "operator");
  return siteConfig;
}

describe("Phase 3 local reliability", () => {
  it("keeps the healthy pointer during bounded retries and rolls back atomically", async () => {
    let now = Date.now();
    const clock = { now: () => new Date(now) };
    const repository = new InMemorySiteRepository(() => now);
    const publisher = new FaultPublisher();
    const service = new DeploymentService(repository, publisher, clock);
    const siteConfig = await seedSite(repository, "reliable-site");

    const first = await service.create("reliable-site", 2, "publish-a", "operator");
    expect(await service.runNext()).toBe(true);
    const stateA = await repository.getPreviewState("reliable-site");
    expect(stateA).toMatchObject({ activeDeploymentId: first.deployment.deploymentId, version: 1 });

    await repository.createRevision(
      "reliable-site",
      2,
      {
        ...siteConfig,
        home: {
          ...siteConfig.home,
          hero: { ...siteConfig.home.hero, summary: "版本 B" }
        }
      },
      "operator"
    );
    publisher.failHealth = true;
    const second = await service.create("reliable-site", 3, "publish-b", "operator");
    await service.runNext();
    expect(await repository.getDeployment("reliable-site", second.deployment.jobId))
      .toMatchObject({ status: "retry_waiting", attemptCount: 1 });
    expect(await repository.getPreviewState("reliable-site")).toEqual(stateA);

    now += 1_001;
    await service.runNext();
    now += 5_001;
    await service.runNext();
    expect(await repository.getDeployment("reliable-site", second.deployment.jobId))
      .toMatchObject({ status: "failed", attemptCount: 3, lastErrorClass: "transient" });
    expect(await repository.getPreviewState("reliable-site")).toEqual(stateA);
    const failureEvents = await repository.listDeploymentEvents(
      "reliable-site",
      second.deployment.jobId
    );
    expect(failureEvents?.filter((event) => event.stage === "retry_scheduled")).toHaveLength(2);
    expect(failureEvents?.at(-1)?.message).not.toMatch(/internal\.example|secret|private stack/);

    publisher.failHealth = false;
    const artifacts = await repository.listReadyArtifacts("reliable-site");
    const target = artifacts.find((artifact) => artifact.artifactId === stateA?.activeArtifactId)!;
    const rollback = await service.createRollback(
      "reliable-site",
      target.artifactId,
      "rollback-a",
      "operator"
    );
    const rollbackReplay = await service.createRollback(
      "reliable-site",
      target.artifactId,
      "rollback-a",
      "operator"
    );
    expect(rollbackReplay).toMatchObject({
      created: false,
      deployment: { jobId: rollback.deployment.jobId }
    });
    await service.runNext();
    expect(await repository.getPreviewState("reliable-site")).toMatchObject({
      activeArtifactId: target.artifactId,
      activeDeploymentId: rollback.deployment.deploymentId,
      version: 2
    });
    expect(await repository.getArtifact("reliable-site", target.artifactId))
      .toMatchObject({ status: "ready", revision: target.revision });
  });

  it("protects the pointer at every pre-activation stage and recovers after restart", async () => {
    for (const stage of ["build", "prepare", "health"] as const) {
      let now = Date.now();
      const repository = new InMemorySiteRepository(() => now);
      const publisher = new FaultPublisher();
      const service = new DeploymentService(repository, publisher, { now: () => new Date(now) });
      const siteId = `fault-${stage}`;
      const siteConfig = await seedSite(repository, siteId);
      await service.create(siteId, 2, `publish-a-${stage}`, "operator");
      await service.runNext();
      const healthy = await repository.getPreviewState(siteId);
      await repository.createRevision(siteId, 2, {
        ...siteConfig,
        home: {
          ...siteConfig.home,
          hero: { ...siteConfig.home.hero, summary: `候选 ${stage}` }
        }
      }, "operator");
      publisher.failBuild = stage === "build";
      publisher.failPrepare = stage === "prepare";
      publisher.failHealth = stage === "health";
      await service.create(siteId, 3, `publish-b-${stage}`, "operator");
      await service.runNext();
      expect(await repository.getPreviewState(siteId)).toEqual(healthy);
    }

    let now = Date.now();
    const repository = new InMemorySiteRepository(() => now);
    const publisher = new FaultPublisher();
    const service = new DeploymentService(repository, publisher, { now: () => new Date(now) });
    const siteConfig = await seedSite(repository, "restart-site");
    await service.create("restart-site", 2, "restart-a", "operator");
    await service.runNext();
    const stateA = await repository.getPreviewState("restart-site");
    await repository.createRevision("restart-site", 2, {
      ...siteConfig,
      home: {
        ...siteConfig.home,
        hero: { ...siteConfig.home.hero, summary: "重启候选" }
      }
    }, "operator");
    publisher.failPrepare = true;
    const candidate = await service.create("restart-site", 3, "restart-b", "operator");
    await service.runNext();
    expect(await repository.getPreviewState("restart-site")).toEqual(stateA);
    now += 1_001;
    publisher.failPrepare = false;
    const restartedService = new DeploymentService(
      repository,
      publisher,
      { now: () => new Date(now) }
    );
    await restartedService.runNext();
    expect(await repository.getDeployment("restart-site", candidate.deployment.jobId))
      .toMatchObject({ status: "healthy", attemptCount: 2 });
    expect((await repository.getPreviewState("restart-site"))?.version).toBe(2);
  });

  it("recovers activation confirmation loss without duplicate activation and fences expired leases", async () => {
    let now = Date.now();
    const repository = new InMemorySiteRepository(() => now);
    const publisher = new FaultPublisher();
    const siteConfig = await seedSite(repository, "confirmation-site");
    const firstService = new DeploymentService(
      repository,
      publisher,
      { now: () => new Date(now) }
    );
    await firstService.create("confirmation-site", 2, "confirmation-a", "operator");
    await firstService.runNext();
    await repository.createRevision("confirmation-site", 2, {
      ...siteConfig,
      home: {
        ...siteConfig.home,
        hero: { ...siteConfig.home.hero, summary: "确认丢失候选" }
      }
    }, "operator");
    let interruptOnce = true;
    const interruptedService = new DeploymentService(
      repository,
      publisher,
      { now: () => new Date(now) },
      {
        afterActivation() {
          if (interruptOnce) {
            interruptOnce = false;
            throw new Error("network timeout after activation");
          }
        }
      }
    );
    const interrupted = await interruptedService.create(
      "confirmation-site",
      3,
      "confirmation-b",
      "operator"
    );
    await interruptedService.runNext();
    const activated = await repository.getPreviewState("confirmation-site");
    expect(activated).toMatchObject({
      activeDeploymentId: interrupted.deployment.deploymentId,
      version: 2
    });
    now += 1_001;
    await firstService.runNext();
    expect(await repository.getDeployment("confirmation-site", interrupted.deployment.jobId))
      .toMatchObject({ status: "healthy", attemptCount: 2 });
    expect((await repository.getPreviewState("confirmation-site"))?.version).toBe(2);

    await repository.createRevision("confirmation-site", 3, {
      ...siteConfig,
      home: {
        ...siteConfig.home,
        hero: { ...siteConfig.home.hero, summary: "过期租约候选" }
      }
    }, "operator");
    publisher.onVerify = () => {
      now += 11 * 60 * 1_000;
    };
    const expired = await firstService.create(
      "confirmation-site",
      4,
      "expired-lease",
      "operator"
    );
    await firstService.runNext();
    expect(await repository.getDeployment("confirmation-site", expired.deployment.jobId))
      .toMatchObject({ status: "deploying" });
    expect(await repository.getPreviewState("confirmation-site")).toEqual(activated);
    await firstService.runNext();
    await firstService.runNext();
    await firstService.runNext();
    await expect(repository.getDeployment("confirmation-site", expired.deployment.jobId))
      .resolves.toMatchObject({
        status: "failed",
        attemptCount: 3,
        lastErrorCode: "attempts_exhausted"
      });
    await expect(repository.listDeploymentEvents("confirmation-site", expired.deployment.jobId))
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "attempts_exhausted", stage: "failed" })
      ]));
  });

  it("rejects cross-site artifact, deployment event and rollback access without disclosure", async () => {
    const repository = new InMemorySiteRepository();
    const publisher = new FaultPublisher();
    const service = new DeploymentService(repository, publisher);
    await seedSite(repository, "site-a");
    await seedSite(repository, "site-b");
    const deployment = await service.create("site-a", 2, "publish-a", "operator");
    await service.runNext();
    const state = await repository.getPreviewState("site-a");
    const app = createApp(repository, { actorId: "operator", deploymentService: service });

    const artifactList = await (await app.request("/sites/site-a/artifacts")).json();
    expect(artifactList[0]).not.toHaveProperty("location");

    const crossEvents = await app.request(
      `/sites/site-b/deployments/${deployment.deployment.jobId}/events`
    );
    expect(crossEvents.status).toBe(404);
    await expect(crossEvents.json()).resolves.toEqual({ error: "deployment_not_found" });

    const crossRollback = await app.request("/sites/site-b/rollbacks", {
      method: "POST",
      body: JSON.stringify({
        artifactId: state!.activeArtifactId,
        idempotencyKey: "cross-site"
      })
    });
    expect(crossRollback.status).toBe(404);
    await expect(crossRollback.json()).resolves.toEqual({ error: "artifact_not_found" });
    await expect(repository.getAuditLogs("site-b")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "security.scope_denied" })])
    );
  });
});
