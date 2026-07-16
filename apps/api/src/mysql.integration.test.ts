import "./load-env.js";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SiteConfig } from "@zhansite/site-config";
import { runMigrations } from "./migrations.js";
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
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""));
  if (!databaseName.endsWith("_test")) {
    throw new Error("DATABASE_URL_TEST must point to a database whose name ends with '_test'.");
  }
  const repository = createMySqlRepository(databaseUrl);
  const tables = [
    "deployment_events",
    "site_preview_states",
    "deployments",
    "build_artifacts",
    "assets",
    "audit_logs",
    "site_revisions",
    "sites",
    "_zhansite_migrations"
  ];

  beforeAll(async () => {
    const pool = mysql.createPool({ uri: databaseUrl, multipleStatements: true });
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of tables) await pool.query(`DROP TABLE IF EXISTS \`${table}\``);
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    await pool.end();
    await runMigrations(databaseUrl);
  });

  beforeEach(async () => {
    const pool = mysql.createPool(databaseUrl);
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of tables.filter((table) => table !== "_zhansite_migrations")) {
      await pool.query(`TRUNCATE TABLE \`${table}\``);
    }
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
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

    const artifact = {
      artifactId: "artifact_mysql_identity",
      siteId: "mysql-site",
      revision: 2,
      template: "b2b-manufacturing-v1" as const,
      templateVersion: "1.0.0",
      inputChecksum: "d".repeat(64),
      location: "artifacts/mysql-site/r2/1.0.0/artifact_mysql_identity",
      status: "building" as const,
      createdBy: "mysql-operator",
      createdAt: now
    };
    const artifactClaim = await repository.claimArtifact(
      artifact,
      new Date(Date.now() + 60_000).toISOString()
    );
    await repository.markArtifactReady(artifact.artifactId, artifactClaim.artifact.leaseToken!);
    await repository.createSite(
      { siteId: "mysql-other-site", name: "其他站点", template: "b2b-manufacturing-v1" },
      config,
      "mysql-operator"
    );
    await expect(
      repository.createDeployment({
        ...deployment,
        deploymentId: "deployment_cross_artifact",
        jobId: "job_cross_artifact",
        siteId: "mysql-other-site",
        revision: 1,
        artifactId: artifact.artifactId,
        idempotencyKey: "cross-artifact"
      })
    ).rejects.toBeTruthy();
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
    const firstDeploymentClaim = concurrentClaims.find(Boolean)!;
    const firstDeploymentToken = firstDeploymentClaim.leaseToken!;
    const expirationPool = mysql.createPool(databaseUrl);
    await expirationPool.query(
      `UPDATE deployments
          SET lease_expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 SECOND)
        WHERE job_id = 'job_mysql_lease'`
    );
    await expirationPool.end();
    await expect(
      repository.updateDeployment(
        "mysql-lease-site",
        "job_mysql_lease",
        firstDeploymentToken,
        { status: "healthy" }
      )
    ).resolves.toBeUndefined();
    const recoveredDeployment = await repository.claimNextDeployment(futureLease);
    expect(recoveredDeployment).toMatchObject({
      jobId: "job_mysql_lease",
      status: "building",
      leaseToken: firstDeploymentToken + 1
    });
    await expect(
      repository.updateDeployment(
        "mysql-lease-site",
        "job_mysql_lease",
        firstDeploymentToken,
        { status: "healthy" }
      )
    ).resolves.toBeUndefined();

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
    const firstArtifactClaim = await repository.claimArtifact(
      artifact,
      new Date(Date.now() - 1_000).toISOString()
    );
    expect(firstArtifactClaim).toMatchObject({ claimed: true, artifact: { leaseToken: 1 } });
    await expect(
      repository.markArtifactReady(artifact.artifactId, firstArtifactClaim.artifact.leaseToken!)
    ).resolves.toBeUndefined();
    const recoveredArtifact = await repository.claimArtifact(artifact, futureLease);
    expect(recoveredArtifact).toMatchObject({
      claimed: true,
      artifact: { artifactId: "artifact_mysql_lease", status: "building", leaseToken: 2 }
    });
    await repository.markArtifactReady(artifact.artifactId, recoveredArtifact.artifact.leaseToken!);
    await expect(repository.claimArtifact(artifact, futureLease)).resolves.toMatchObject({
      claimed: false,
      artifact: { status: "ready" }
    });

    const concurrentArtifact = {
      ...artifact,
      artifactId: "artifact_mysql_concurrent",
      inputChecksum: "e".repeat(64),
      location: "artifacts/mysql-lease-site/r1/1.0.0/artifact_mysql_concurrent"
    };
    const concurrentArtifactClaims = await Promise.all([
      repository.claimArtifact(concurrentArtifact, futureLease),
      repository.claimArtifact(concurrentArtifact, futureLease)
    ]);
    expect(concurrentArtifactClaims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect(concurrentArtifactClaims.filter((claim) => !claim.claimed)).toHaveLength(1);
  });

  it("atomically activates preview state, fences stale workers and persists ordered events", async () => {
    await repository.createSite(
      { siteId: "mysql-preview-site", name: "预览原子站点", template: "b2b-manufacturing-v1" },
      config,
      "mysql-worker"
    );
    const now = new Date().toISOString();
    const artifactInput = {
      artifactId: "artifact_mysql_preview",
      siteId: "mysql-preview-site",
      revision: 1,
      template: "b2b-manufacturing-v1" as const,
      templateVersion: "1.0.0",
      inputChecksum: "f".repeat(64),
      location: "artifacts/mysql-preview-site/r1/1.0.0/artifact_mysql_preview",
      status: "building" as const,
      createdBy: "mysql-worker",
      createdAt: now
    };
    const artifactClaim = await repository.claimArtifact(
      artifactInput,
      new Date(Date.now() + 60_000).toISOString()
    );
    await repository.markArtifactReady(artifactInput.artifactId, artifactClaim.artifact.leaseToken!);

    for (const suffix of ["a", "b"]) {
      await repository.createDeployment({
        deploymentId: `deployment_preview_${suffix}`,
        jobId: `job_preview_${suffix}`,
        siteId: "mysql-preview-site",
        revision: 1,
        artifactId: artifactInput.artifactId,
        targetArtifactId: artifactInput.artifactId,
        kind: "rollback",
        environment: "preview",
        idempotencyKey: `preview-${suffix}`,
        status: "queued",
        attemptCount: 0,
        maxAttempts: 3,
        placeholderAssetIds: [],
        createdBy: "mysql-worker",
        createdAt: now,
        updatedAt: now
      });
    }
    const lease = new Date(Date.now() + 60_000).toISOString();
    const first = await repository.claimNextDeployment(lease);
    const second = await repository.claimNextDeployment(lease);
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    await expect(repository.activatePreview({
      siteId: "mysql-preview-site",
      deploymentId: first!.deploymentId,
      artifactId: artifactInput.artifactId,
      leaseToken: first!.leaseToken! - 1,
      expectedVersion: 0,
      previewUrl: "https://mysql-preview.test",
      activatedAt: now
    })).resolves.toBe("lease_lost");

    const activations = await Promise.all([
      repository.activatePreview({
        siteId: "mysql-preview-site",
        deploymentId: first!.deploymentId,
        artifactId: artifactInput.artifactId,
        leaseToken: first!.leaseToken!,
        expectedVersion: 0,
        previewUrl: "https://mysql-preview.test",
        activatedAt: now
      }),
      repository.activatePreview({
        siteId: "mysql-preview-site",
        deploymentId: second!.deploymentId,
        artifactId: artifactInput.artifactId,
        leaseToken: second!.leaseToken!,
        expectedVersion: 0,
        previewUrl: "https://mysql-preview.test",
        activatedAt: now
      })
    ]);
    expect(activations.filter((result) => result === "activated")).toHaveLength(1);
    expect(activations.filter((result) => result === "activation_conflict")).toHaveLength(1);
    await expect(repository.getPreviewState("mysql-preview-site")).resolves.toMatchObject({
      activeArtifactId: artifactInput.artifactId,
      version: 1
    });

    await repository.appendDeploymentEvent({
      deploymentId: first!.deploymentId,
      siteId: "mysql-preview-site",
      attempt: 1,
      stage: "claimed",
      level: "info",
      code: "deployment_claimed",
      message: "任务已领取"
    });
    await repository.appendDeploymentEvent({
      deploymentId: first!.deploymentId,
      siteId: "mysql-preview-site",
      attempt: 1,
      stage: "activated",
      level: "info",
      code: "activation_succeeded",
      message: "激活成功"
    });
    await expect(repository.listDeploymentEvents("mysql-preview-site", first!.jobId))
      .resolves.toMatchObject([{ sequence: 1 }, { sequence: 2 }]);
    await expect(repository.listDeploymentEvents("mysql-other-site", first!.jobId))
      .resolves.toBeUndefined();
  });

  it("records migration checksums and installs critical constraints", async () => {
    const pool = mysql.createPool(databaseUrl);
    const [migrations] = await pool.query<RowDataPacket[]>(
      "SELECT filename, checksum_sha256 FROM `_zhansite_migrations` ORDER BY filename"
    );
    expect(migrations).toHaveLength(6);
    const [constraints] = await pool.query<RowDataPacket[]>(
      `SELECT constraint_name
         FROM information_schema.table_constraints
        WHERE table_schema = DATABASE()
          AND constraint_name IN (
            'build_artifacts_revision_fk',
            'deployments_revision_fk',
            'deployments_artifact_identity_fk',
            'assets_source_approval_ck',
            'site_preview_states_artifact_fk',
            'site_preview_states_deployment_fk',
            'deployment_events_deployment_fk'
          )`
    );
    expect(constraints).toHaveLength(7);
    const [indexes] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT index_name
         FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND index_name IN (
            'deployments_claim_idx',
            'audit_logs_site_created_idx',
            'deployment_events_order_uq',
            'site_preview_states_identity_uq'
          )`
    );
    expect(indexes).toHaveLength(4);
    await pool.end();
  });
});
