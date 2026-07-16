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
});
