import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SiteConfig } from "@zhansite/site-config";
import { createMySqlRepository } from "./mysql-repository.js";

const databaseUrl = process.env.DATABASE_URL_TEST;
const describeMySql = databaseUrl ? describe : describe.skip;

const config: SiteConfig = {
  brand: { name: "MySQL 集成站点", primaryColor: "#123456", logoAssetId: "asset_logo_pending" },
  contact: { phone: "0571-12345678", address: "测试地址" },
  assets: { certificates: [] },
  home: {
    hero: { title: "测试站点", summary: "MySQL 集成测试" },
    principles: ["可靠"],
    strengths: ["可测试"],
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
  about: { introduction: "测试介绍", principles: ["可靠"], industries: [] }
};

describeMySql("MySQL repository integration", () => {
  if (!databaseUrl) return;
  const parsedUrl = new URL(databaseUrl);
  if (!/test/i.test(parsedUrl.pathname)) {
    throw new Error("DATABASE_URL_TEST must point to a database whose name contains 'test'.");
  }
  const repository = createMySqlRepository(databaseUrl);
  const tables = ["deployments", "build_artifacts", "assets", "audit_logs", "site_revisions", "sites"];

  beforeAll(async () => {
    const pool = mysql.createPool({ uri: databaseUrl, multipleStatements: true });
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of tables) await pool.query(`DROP TABLE IF EXISTS \`${table}\``);
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    for (const migration of [
      "0000_phase1_baseline.sql",
      "0001_add_site_foreign_keys.sql",
      "0002_phase2_assets_and_preview.sql",
      "0003_reliable_deployment_leases.sql"
    ]) {
      await pool.query(await readFile(resolve(process.cwd(), "drizzle", migration), "utf8"));
    }
    await pool.end();
  });

  afterAll(async () => {
    await repository.close?.();
    const pool = mysql.createPool(databaseUrl);
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of tables) await pool.query(`DROP TABLE IF EXISTS \`${table}\``);
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    await pool.end();
  });

  it("persists revision 1, enforces optimistic conflicts and records assets/audits", async () => {
    const created = await repository.createSite(
      { siteId: "mysql-site", name: "MySQL 站点", template: "b2b-manufacturing-v1" },
      config,
      "mysql-operator"
    );
    expect(created.site.currentRevision).toBe(1);
    expect(created.revision.revision).toBe(1);

    const next = await repository.createRevision("mysql-site", 1, config, "mysql-operator");
    expect(next.kind).toBe("created");
    await expect(repository.createRevision("mysql-site", 1, config, "mysql-operator")).resolves.toEqual({
      kind: "conflict",
      currentRevision: 2
    });

    const now = new Date().toISOString();
    await repository.createAsset({
      assetId: "asset_mysql_logo",
      siteId: "mysql-site",
      type: "logo",
      status: "verified",
      sourceKind: "customer_provided",
      objectKey: "assets/mysql-site/logo",
      url: "https://assets.example.test/logo.png",
      contentType: "image/png",
      sizeBytes: 8,
      checksumSha256: "a".repeat(64),
      originalFilename: "logo.png",
      createdBy: "mysql-operator",
      verifiedBy: "mysql-operator",
      createdAt: now,
      verifiedAt: now
    });
    await expect(repository.getAssetsByIds(["asset_mysql_logo"])).resolves.toEqual([
      expect.objectContaining({ siteId: "mysql-site", type: "logo" })
    ]);
    await expect(
      repository.createAsset({
        assetId: "asset_orphan_logo",
        siteId: "missing-site",
        type: "logo",
        status: "verified",
        sourceKind: "customer_provided",
        objectKey: "assets/missing-site/logo",
        url: "https://assets.example.test/orphan.png",
        contentType: "image/png",
        sizeBytes: 8,
        checksumSha256: "b".repeat(64),
        originalFilename: "orphan.png",
        createdBy: "mysql-operator",
        verifiedBy: "mysql-operator",
        createdAt: now,
        verifiedAt: now
      })
    ).rejects.toBeTruthy();

    const deployment = {
      deploymentId: "deployment_mysql",
      jobId: "job_mysql",
      siteId: "mysql-site",
      revision: 2,
      environment: "preview" as const,
      idempotencyKey: "mysql-idempotency",
      status: "queued" as const,
      placeholderAssetIds: [],
      createdBy: "mysql-operator",
      createdAt: now,
      updatedAt: now
    };
    await expect(repository.createDeployment(deployment)).resolves.toMatchObject({ created: true });
    await expect(repository.createDeployment({ ...deployment, jobId: "job_mysql_duplicate" }))
      .resolves.toMatchObject({ created: false, deployment: { jobId: "job_mysql" } });
    await expect(repository.getDeployment("mysql-site", "job_mysql")).resolves.toMatchObject({
      revision: 2,
      placeholderAssetIds: []
    });
    await expect(repository.getAuditLogs("mysql-site")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "site.created" }),
        expect.objectContaining({ action: "revision.created" }),
        expect.objectContaining({ action: "asset.verified" }),
        expect.objectContaining({ action: "deployment.created" })
      ])
    );
  });

  it("claims deployments once and recovers expired deployment and artifact leases", async () => {
    await repository.createSite(
      { siteId: "mysql-lease-site", name: "MySQL 租约站点", template: "b2b-manufacturing-v1" },
      config,
      "mysql-worker"
    );
    const now = new Date().toISOString();
    await repository.createDeployment({
      deploymentId: "deployment_mysql_lease",
      jobId: "job_mysql_lease",
      siteId: "mysql-lease-site",
      revision: 1,
      environment: "preview",
      idempotencyKey: "mysql-lease-idempotency",
      status: "queued",
      placeholderAssetIds: [],
      createdBy: "mysql-worker",
      createdAt: now,
      updatedAt: now
    });

    const futureLease = new Date(Date.now() + 60_000).toISOString();
    const concurrentClaims = await Promise.all([
      repository.claimNextDeployment(futureLease),
      repository.claimNextDeployment(futureLease)
    ]);
    expect(concurrentClaims.filter(Boolean)).toHaveLength(1);
    expect(concurrentClaims.find(Boolean)).toMatchObject({
      jobId: "job_mysql_lease",
      status: "building"
    });

    await repository.updateDeployment("mysql-lease-site", "job_mysql_lease", {
      status: "building",
      leaseExpiresAt: new Date(Date.now() - 1_000).toISOString()
    });
    await expect(repository.claimNextDeployment(futureLease)).resolves.toMatchObject({
      jobId: "job_mysql_lease",
      status: "building"
    });

    const artifact = {
      artifactId: "artifact_mysql_lease",
      siteId: "mysql-lease-site",
      revision: 1,
      template: "b2b-manufacturing-v1" as const,
      templateVersion: "1.0.0",
      inputChecksum: "c".repeat(64),
      location: "artifacts/mysql-lease-site/r1/1.0.0/artifact_mysql_lease",
      status: "building" as const,
      createdBy: "mysql-worker",
      createdAt: now
    };
    await expect(
      repository.claimArtifact(artifact, new Date(Date.now() - 1_000).toISOString())
    ).resolves.toMatchObject({ claimed: true });
    await expect(repository.claimArtifact(artifact, futureLease)).resolves.toMatchObject({
      claimed: true,
      artifact: { artifactId: "artifact_mysql_lease", status: "building" }
    });
    await repository.markArtifactReady(artifact.artifactId);
    await expect(repository.claimArtifact(artifact, futureLease)).resolves.toMatchObject({
      claimed: false,
      artifact: { status: "ready" }
    });
  });
});
