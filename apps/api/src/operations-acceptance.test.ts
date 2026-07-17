import { describe, expect, it } from "vitest";
import type { SiteConfig } from "@zhansite/site-config";
import { createApp } from "./app.js";
import { DeploymentService, type PreviewPublisher } from "./deployment-service.js";
import { InMemorySiteRepository } from "./repository.js";

const config: SiteConfig = {
  brand: {
    name: "V1 本地交付闭环验收站",
    primaryColor: "#123456",
    logoAssetId: "asset_operations_logo"
  },
  contact: { phone: "0571-12345678", address: "本地验收地址" },
  assets: { certificates: [] },
  home: {
    hero: { title: "本地交付首稿", summary: "审核闭环验收" },
    principles: ["可靠"],
    strengths: ["可回滚"],
    featuredCategoryIds: ["category"]
  },
  products: {
    categories: [{
      id: "category",
      slug: "category",
      name: "测试分类",
      summary: "测试分类摘要",
      series: [{ id: "series", name: "测试产品", sellingPoint: "稳定" }]
    }]
  },
  certifications: { groups: [] },
  about: { introduction: "本地闭环验收。", principles: ["可靠"], industries: [] }
};

const publisher: PreviewPublisher = {
  async buildAndStore() {},
  async prepareRelease() {},
  async verifyRelease(_releasePrefix, siteId) {
    return `http://127.0.0.1/${siteId}`;
  },
  async publish(_artifactPrefix, siteId) {
    return `http://127.0.0.1/${siteId}`;
  }
};

describe("V1 local operations closure acceptance", () => {
  it("creates, publishes, reviews, modifies, approves and rolls back one site", async () => {
    const repository = new InMemorySiteRepository();
    const deploymentService = new DeploymentService(repository, publisher);
    const app = createApp(repository, { actorId: "local-operator", deploymentService });
    const post = (path: string, body: unknown) =>
      app.request(path, { method: "POST", body: JSON.stringify(body) });

    const created = await post("/sites", {
      siteId: "operations-closure",
      name: "V1 本地交付闭环验收站",
      template: "b2b-manufacturing-v1",
      config
    });
    expect(created.status).toBe(201);
    const now = new Date().toISOString();
    await repository.createAsset({
      assetId: "asset_operations_logo",
      siteId: "operations-closure",
      type: "logo",
      status: "verified",
      sourceKind: "customer_provided",
      objectKey: "assets/operations-closure/logo.svg",
      url: "http://127.0.0.1/assets/logo.svg",
      contentType: "image/svg+xml",
      sizeBytes: 100,
      checksumSha256: "a".repeat(64),
      originalFilename: "logo.svg",
      createdBy: "local-operator",
      verifiedBy: "local-operator",
      createdAt: now,
      verifiedAt: now
    });

    const publish1 = await post("/sites/operations-closure/deployments", {
      revision: 1,
      idempotencyKey: "publish-r1"
    });
    const job1 = await publish1.json();
    expect(await deploymentService.runNext()).toBe(true);
    const healthy1 = await (await app.request(`/sites/operations-closure/deployments/${job1.jobId}`)).json();
    expect(healthy1.status).toBe("healthy");

    const review = (body: unknown) => post("/sites/operations-closure/reviews", body);
    expect((await review({
      revision: 1,
      deploymentId: healthy1.deploymentId,
      kind: "preview_sent",
      channel: "wechat",
      note: "发送首稿",
      expectedStatus: "draft"
    })).status).toBe(201);
    expect((await review({
      revision: 1,
      deploymentId: healthy1.deploymentId,
      kind: "customer_feedback",
      channel: "wechat",
      note: "修改首页标题",
      expectedStatus: "review_requested"
    })).status).toBe(201);

    const revisedConfig: SiteConfig = {
      ...config,
      home: {
        ...config.home,
        hero: { ...config.home.hero, title: "客户反馈后的修改稿" }
      }
    };
    expect((await post("/sites/operations-closure/revisions", {
      expectedRevision: 1,
      config: revisedConfig
    })).status).toBe(201);
    const publish2 = await post("/sites/operations-closure/deployments", {
      revision: 2,
      idempotencyKey: "publish-r2"
    });
    const job2 = await publish2.json();
    expect(await deploymentService.runNext()).toBe(true);
    const healthy2 = await (await app.request(`/sites/operations-closure/deployments/${job2.jobId}`)).json();
    expect((await review({
      revision: 2,
      deploymentId: healthy2.deploymentId,
      kind: "preview_sent",
      channel: "phone",
      note: "发送修改稿",
      expectedStatus: "draft"
    })).status).toBe(201);
    expect((await review({
      revision: 2,
      deploymentId: healthy2.deploymentId,
      kind: "customer_confirmed",
      channel: "phone",
      note: "客户确认",
      expectedStatus: "review_requested"
    })).status).toBe(201);

    const artifacts = await repository.listReadyArtifacts("operations-closure");
    const revision1Artifact = artifacts.find((artifact) => artifact.revision === 1);
    expect(revision1Artifact).toBeDefined();
    const rollback = await post("/sites/operations-closure/rollbacks", {
      artifactId: revision1Artifact!.artifactId,
      idempotencyKey: "rollback-r1"
    });
    expect(rollback.status).toBe(202);
    expect(await deploymentService.runNext()).toBe(true);

    await expect(repository.getPreviewState("operations-closure")).resolves.toMatchObject({
      activeArtifactId: revision1Artifact!.artifactId
    });
    await expect(repository.getRevision("operations-closure", 2)).resolves.toMatchObject({
      contentStatus: "approved"
    });
    await expect(repository.listReviewRecords("operations-closure")).resolves.toHaveLength(4);
    await expect(repository.getAuditLogs("operations-closure")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "site.created" }),
        expect.objectContaining({ action: "revision.status.approved" }),
        expect.objectContaining({ action: "rollback.activated" })
      ])
    );
  });
});
