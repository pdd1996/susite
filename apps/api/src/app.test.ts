import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { InMemorySiteRepository } from "./repository.js";
import { isDuplicateEntryError } from "./mysql-repository.js";
import {
  DeploymentService,
  UnavailablePreviewPublisher,
  verifyPreviewHealth,
  type PreviewPublisher
} from "./deployment-service.js";

const config = {
  brand: { name: "杭州金源电器有限公司", primaryColor: "#C41E3A", logoAssetId: "asset_logo_01" },
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
  about: { introduction: "专业生产互感器产品。", principles: ["以质量求生存"], industries: ["电网"] }
};

describe("Phase 1 site API", () => {
  it("recognizes MySQL duplicate-key errors for 409 mapping", () => {
    expect(isDuplicateEntryError({ code: "ER_DUP_ENTRY" })).toBe(true);
    expect(isDuplicateEntryError(new Error("other"))).toBe(false);
  });

  it("creates immutable revisions and rejects stale writes", async () => {
    const repository = new InMemorySiteRepository();
    const app = createApp(repository, { actorId: "trusted-operator" });
    const createSite = await app.request("/sites", {
      method: "POST",
      body: JSON.stringify({
        siteId: "jinyuan-20260524",
        name: "杭州金源电器",
        template: "b2b-manufacturing-v1",
        config
      })
    });
    expect(createSite.status).toBe(201);
    await expect(createSite.json()).resolves.toMatchObject({
      site: { currentRevision: 1 },
      revision: { revision: 1 }
    });
    await expect(repository.getAuditLogs("jinyuan-20260524")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "site.created" }),
        expect.objectContaining({ action: "revision.created", targetId: "jinyuan-20260524:1" })
      ])
    );

    const createRevision = () =>
      app.request("/sites/jinyuan-20260524/revisions", {
        method: "POST",
        body: JSON.stringify({ expectedRevision: 1, config })
      });

    expect((await createRevision()).status).toBe(201);
    const staleWrite = await createRevision();
    expect(staleWrite.status).toBe(409);
    await expect(staleWrite.json()).resolves.toMatchObject({
      error: "revision_conflict",
      currentRevision: 2
    });

    const [revision] = await (
      await app.request("/sites/jinyuan-20260524/revisions")
    ).json();
    expect(revision.createdBy).toBe("trusted-operator");
  });

  it("returns stable client errors for malformed JSON and duplicate sites", async () => {
    const app = createApp(new InMemorySiteRepository(), { actorId: "trusted-operator" });
    const malformed = await app.request("/sites", { method: "POST", body: "{" });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: "invalid_json" });

    const body = JSON.stringify({
      siteId: "duplicate-site",
      name: "重复站点",
      template: "b2b-manufacturing-v1",
      config
    });
    expect((await app.request("/sites", { method: "POST", body })).status).toBe(201);
    expect((await app.request("/sites", { method: "POST", body })).status).toBe(409);
  });

  it("signs, verifies and registers a local asset with server-computed checksum", async () => {
    const repository = new InMemorySiteRepository();
    const app = createApp(repository, { actorId: "trusted-operator" });
    await app.request("/sites", {
      method: "POST",
      body: JSON.stringify({
        siteId: "asset-site",
        name: "素材站点",
        template: "b2b-manufacturing-v1",
        config
      })
    });
    const content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const sign = await app.request("/sites/asset-site/upload/sign", {
      method: "POST",
      body: JSON.stringify({
        type: "logo",
        contentType: "image/png",
        sizeBytes: content.byteLength,
        originalFilename: "logo.png",
        sourceKind: "customer_provided"
      })
    });
    expect(sign.status).toBe(201);
    const signed = await sign.json();
    expect(
      (
        await app.request(signed.url, {
          method: "PUT",
          headers: signed.headers,
          body: content
        })
      ).status
    ).toBe(204);
    const complete = await app.request("/sites/asset-site/assets/complete", {
      method: "POST",
      body: JSON.stringify({ uploadToken: signed.uploadToken })
    });
    expect(complete.status).toBe(201);
    await expect(complete.json()).resolves.toMatchObject({
      siteId: "asset-site",
      type: "logo",
      status: "verified",
      checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    const replay = await app.request("/sites/asset-site/assets/complete", {
      method: "POST",
      body: JSON.stringify({ uploadToken: signed.uploadToken })
    });
    expect(replay.status).toBe(201);
    await expect(repository.listAssets("asset-site")).resolves.toHaveLength(1);
    await expect(repository.getAuditLogs("asset-site")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "asset.upload_signed" }),
        expect.objectContaining({ action: "asset.verified" })
      ])
    );

    const invalidPdf = Buffer.from("%PDF-1.7\nnot-a-readable-document");
    const pdfSign = await app.request("/sites/asset-site/upload/sign", {
      method: "POST",
      body: JSON.stringify({
        type: "product_pdf",
        contentType: "application/pdf",
        sizeBytes: invalidPdf.byteLength,
        originalFilename: "invalid.pdf",
        sourceKind: "customer_provided"
      })
    });
    const signedPdf = await pdfSign.json();
    await app.request(signedPdf.url, {
      method: "PUT",
      headers: signedPdf.headers,
      body: invalidPdf
    });
    const completePdf = await app.request("/sites/asset-site/assets/complete", {
      method: "POST",
      body: JSON.stringify({ uploadToken: signedPdf.uploadToken })
    });
    expect(completePdf.status).toBe(400);
    await expect(completePdf.json()).resolves.toEqual({ error: "upload_content_invalid" });
  });

  it("rejects wrong-site draft assets and keeps deployment idempotent", async () => {
    const repository = new InMemorySiteRepository();
    const publisher: PreviewPublisher = {
      async buildAndStore() {},
      async publish(_prefix, siteId) {
        return `https://${siteId}.preview.example.test`;
      }
    };
    const deploymentService = new DeploymentService(repository, publisher);
    const app = createApp(repository, {
      actorId: "trusted-operator",
      deploymentService
    });
    for (const siteId of ["first-site", "second-site"]) {
      await app.request("/sites", {
        method: "POST",
        body: JSON.stringify({
          siteId,
          name: siteId,
          template: "b2b-manufacturing-v1",
          config
        })
      });
    }
    const now = new Date().toISOString();
    await repository.createAsset({
      assetId: "asset_verified_logo",
      siteId: "first-site",
      type: "logo",
      status: "verified",
      sourceKind: "customer_provided",
      objectKey: "assets/first/logo",
      url: "https://assets.example/logo.png",
      contentType: "image/png",
      sizeBytes: 8,
      checksumSha256: "a".repeat(64),
      originalFilename: "logo.png",
      createdBy: "trusted-operator",
      verifiedBy: "trusted-operator",
      createdAt: now,
      verifiedAt: now
    });
    const validConfig = {
      ...config,
      brand: { ...config.brand, logoAssetId: "asset_verified_logo" }
    };
    const crossSite = await app.request("/sites/second-site/revisions", {
      method: "POST",
      body: JSON.stringify({ expectedRevision: 1, config: validConfig })
    });
    expect(crossSite.status).toBe(400);
    await expect(crossSite.json()).resolves.toMatchObject({
      error: "asset_validation_failed",
      issues: [expect.objectContaining({ code: "asset_wrong_site", path: "brand.logoAssetId" })]
    });

    const revision = await app.request("/sites/first-site/revisions", {
      method: "POST",
      body: JSON.stringify({ expectedRevision: 1, config: validConfig })
    });
    expect(revision.status).toBe(201);
    const deploy = () =>
      app.request("/sites/first-site/deployments", {
        method: "POST",
        body: JSON.stringify({ revision: 2, idempotencyKey: "same-request" })
      });
    const first = await deploy();
    const second = await deploy();
    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    const firstPayload = await first.json();
    const secondPayload = await second.json();
    expect(firstPayload.jobId).toBe(secondPayload.jobId);
    expect(firstPayload.placeholderAssetIds).toEqual([]);

    await deploymentService.runNext();
    await vi.waitFor(async () => {
      const status = await app.request(`/sites/first-site/deployments/${secondPayload.jobId}`);
      expect((await status.json()).status).toBe("healthy");
    });

    const unavailableApp = createApp(repository, { actorId: "trusted-operator" });
    const unavailable = await unavailableApp.request("/sites/first-site/deployments", {
      method: "POST",
      body: JSON.stringify({ revision: 2, idempotencyKey: "preview-not-configured" })
    });
    const unavailablePayload = await unavailable.json();
    const unavailableService = new DeploymentService(repository, new UnavailablePreviewPublisher());
    await unavailableService.runNext();
    await vi.waitFor(async () => {
      const status = await unavailableApp.request(
        `/sites/first-site/deployments/${unavailablePayload.jobId}`
      );
      expect(await status.json()).toMatchObject({
        status: "failed",
        errorSummary: "preview_not_configured"
      });
    });

    await repository.createAsset({
      assetId: "asset_unapproved_placeholder",
      siteId: "first-site",
      type: "logo",
      status: "verified",
      sourceKind: "placeholder",
      objectKey: "assets/first/placeholder",
      url: "https://assets.example/placeholder.png",
      contentType: "image/png",
      sizeBytes: 8,
      checksumSha256: "b".repeat(64),
      originalFilename: "placeholder.png",
      createdBy: "trusted-operator",
      verifiedBy: "trusted-operator",
      createdAt: now,
      verifiedAt: now
    });
    const placeholderConfig = {
      ...config,
      brand: { ...config.brand, logoAssetId: "asset_unapproved_placeholder" }
    };
    expect(
      (
        await app.request("/sites/first-site/revisions", {
          method: "POST",
          body: JSON.stringify({ expectedRevision: 2, config: placeholderConfig })
        })
      ).status
    ).toBe(201);
    const blockedDeployment = await app.request("/sites/first-site/deployments", {
      method: "POST",
      body: JSON.stringify({ revision: 3, idempotencyKey: "placeholder-not-approved" })
    });
    expect(blockedDeployment.status).toBe(400);
    await expect(blockedDeployment.json()).resolves.toMatchObject({
      error: "asset_validation_failed",
      issues: [expect.objectContaining({ code: "placeholder_not_approved" })]
    });
  });

  it("requires routes and referenced static resources to pass preview health checks", async () => {
    const healthyFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(
        url.endsWith("/")
          ? '<html><script src="/assets/app.js"></script><link href="https://assets.example/logo.png"></html>'
          : "ok",
        { status: 200 }
      );
    });
    await verifyPreviewHealth("https://site.preview.example.test", healthyFetch);
    expect(healthyFetch).toHaveBeenCalledWith(
      "https://site.preview.example.test/assets/app.js",
      { redirect: "follow" }
    );
    expect(healthyFetch).toHaveBeenCalledWith(
      "https://assets.example/logo.png",
      { redirect: "follow" }
    );

    const failedFetch = vi.fn(async (input: string | URL | Request) =>
      new Response("failed", { status: String(input).endsWith("/assets/app.js") ? 404 : 200 })
    );
    failedFetch.mockImplementationOnce(async () =>
      new Response('<script src="/assets/app.js"></script>', { status: 200 })
    );
    await expect(
      verifyPreviewHealth("https://site.preview.example.test", failedFetch)
    ).rejects.toThrow("health_check_failed:resource");
  });
});
