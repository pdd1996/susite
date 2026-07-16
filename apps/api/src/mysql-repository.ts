import mysql from "mysql2/promise";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { SiteConfig } from "@zhansite/site-config";
import { assets, auditLogs, buildArtifacts, deployments, siteRevisions, sites } from "./db-schema.js";
import {
  SiteAlreadyExistsError,
  type Asset,
  type AssetType,
  type AuditLog,
  type BuildArtifact,
  type Deployment,
  type Site,
  type SiteRepository,
  type SiteRevision
} from "./repository.js";

const asSite = (row: typeof sites.$inferSelect): Site => ({
  siteId: row.siteId,
  name: row.name,
  template: "b2b-manufacturing-v1",
  currentRevision: row.currentRevision
});

const asRevision = (row: typeof siteRevisions.$inferSelect): SiteRevision => ({
  siteId: row.siteId,
  revision: row.revision,
  schemaVersion: "1.0",
  config: row.config as SiteConfig,
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString()
});

const asAsset = (row: typeof assets.$inferSelect): Asset => ({
  assetId: row.assetId,
  siteId: row.siteId,
  type: row.type as AssetType,
  status: row.status as Asset["status"],
  sourceKind: row.sourceKind as Asset["sourceKind"],
  ...(row.placeholderApprovedBy ? { placeholderApprovedBy: row.placeholderApprovedBy } : {}),
  ...(row.placeholderApprovedAt ? { placeholderApprovedAt: row.placeholderApprovedAt.toISOString() } : {}),
  objectKey: row.objectKey,
  url: row.url,
  contentType: row.contentType,
  sizeBytes: row.sizeBytes,
  checksumSha256: row.checksumSha256,
  originalFilename: row.originalFilename,
  createdBy: row.createdBy,
  verifiedBy: row.verifiedBy,
  createdAt: row.createdAt.toISOString(),
  verifiedAt: row.verifiedAt.toISOString()
});

const asArtifact = (row: typeof buildArtifacts.$inferSelect): BuildArtifact => ({
  artifactId: row.artifactId,
  siteId: row.siteId,
  revision: row.revision,
  template: "b2b-manufacturing-v1",
  templateVersion: row.templateVersion,
  inputChecksum: row.inputChecksum,
  location: row.location,
  status: row.status as BuildArtifact["status"],
  ...(row.leaseExpiresAt ? { leaseExpiresAt: row.leaseExpiresAt.toISOString() } : {}),
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString()
});

const asDeployment = (row: typeof deployments.$inferSelect): Deployment => ({
  deploymentId: row.deploymentId,
  jobId: row.jobId,
  siteId: row.siteId,
  revision: row.revision,
  ...(row.artifactId ? { artifactId: row.artifactId } : {}),
  environment: "preview",
  idempotencyKey: row.idempotencyKey,
  status: row.status as Deployment["status"],
  placeholderAssetIds: row.placeholderAssetIds,
  ...(row.previewUrl ? { previewUrl: row.previewUrl } : {}),
  ...(row.errorSummary ? { errorSummary: row.errorSummary } : {}),
  ...(row.leaseExpiresAt ? { leaseExpiresAt: row.leaseExpiresAt.toISOString() } : {}),
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

export const isDuplicateEntryError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ER_DUP_ENTRY";

export function createMySqlRepository(databaseUrl: string): SiteRepository {
  const pool = mysql.createPool(databaseUrl);
  const db = drizzle({ client: pool });

  return {
    async createSite(site, initialConfig, actorId) {
      const revision: SiteRevision = {
        siteId: site.siteId,
        revision: 1,
        schemaVersion: "1.0",
        config: initialConfig,
        createdBy: actorId,
        createdAt: new Date().toISOString()
      };
      try {
        await db.transaction(async (tx) => {
          await tx.insert(sites).values({ ...site, currentRevision: 1 });
          await tx.insert(siteRevisions).values({
            siteId: site.siteId,
            revision: 1,
            schemaVersion: "1.0",
            config: initialConfig,
            createdBy: actorId
          });
          await tx.insert(auditLogs).values({
            actorId,
            action: "site.created",
            siteId: site.siteId,
            targetId: site.siteId
          });
          await tx.insert(auditLogs).values({
            actorId,
            action: "revision.created",
            siteId: site.siteId,
            targetId: `${site.siteId}:1`
          });
        });
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          throw new SiteAlreadyExistsError(site.siteId);
        }
        throw error;
      }
      return { site: { ...site, currentRevision: 1 }, revision };
    },

    async listSites() {
      return (await db.select().from(sites)).map(asSite);
    },

    async getSite(siteId) {
      const [site] = await db.select().from(sites).where(eq(sites.siteId, siteId));
      return site ? asSite(site) : undefined;
    },

    async getRevisions(siteId) {
      const rows = await db
        .select()
        .from(siteRevisions)
        .where(eq(siteRevisions.siteId, siteId))
        .orderBy(desc(siteRevisions.revision));
      return rows.map(asRevision);
    },

    async getRevision(siteId, revision) {
      const [row] = await db
        .select()
        .from(siteRevisions)
        .where(and(eq(siteRevisions.siteId, siteId), eq(siteRevisions.revision, revision)));
      return row ? asRevision(row) : undefined;
    },

    async createRevision(siteId, expectedRevision, config, actorId) {
      return db.transaction(async (tx) => {
        const [site] = await tx.select().from(sites).where(eq(sites.siteId, siteId)).for("update");
        if (!site) return { kind: "not_found" as const };
        if (site.currentRevision !== expectedRevision) {
          return { kind: "conflict" as const, currentRevision: site.currentRevision };
        }

        const revision: SiteRevision = {
          siteId,
          revision: expectedRevision + 1,
          schemaVersion: "1.0",
          config,
          createdBy: actorId,
          createdAt: new Date().toISOString()
        };
        await tx.insert(siteRevisions).values({
          siteId,
          revision: revision.revision,
          schemaVersion: revision.schemaVersion,
          config,
          createdBy: actorId
        });
        await tx
          .update(sites)
          .set({ currentRevision: revision.revision })
          .where(and(eq(sites.siteId, siteId), eq(sites.currentRevision, expectedRevision)));
        await tx.insert(auditLogs).values({
          actorId,
          action: "revision.created",
          siteId,
          targetId: `${siteId}:${revision.revision}`
        });
        return { kind: "created" as const, revision };
      });
    },

    async createAsset(asset) {
      try {
        await db.transaction(async (tx) => {
          await tx.insert(assets).values({
            ...asset,
            placeholderApprovedAt: asset.placeholderApprovedAt
              ? new Date(asset.placeholderApprovedAt)
              : null,
            createdAt: new Date(asset.createdAt),
            verifiedAt: new Date(asset.verifiedAt)
          });
          await tx.insert(auditLogs).values({
            actorId: asset.createdBy,
            action: "asset.verified",
            siteId: asset.siteId,
            targetId: asset.assetId
          });
        });
        return asset;
      } catch (error) {
        if (!isDuplicateEntryError(error)) throw error;
        const [existing] = await db.select().from(assets).where(eq(assets.assetId, asset.assetId));
        if (!existing) throw error;
        return asAsset(existing);
      }
    },

    async listAssets(siteId) {
      return (
        await db.select().from(assets).where(eq(assets.siteId, siteId)).orderBy(desc(assets.createdAt))
      ).map(asAsset);
    },

    async getAssetsByIds(assetIds) {
      if (assetIds.length === 0) return [];
      return (await db.select().from(assets).where(inArray(assets.assetId, assetIds))).map(asAsset);
    },

    async claimArtifact(artifact, leaseExpiresAt) {
      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(buildArtifacts)
          .where(eq(buildArtifacts.artifactId, artifact.artifactId))
          .for("update");
        if (existing) {
          const existingArtifact = asArtifact(existing);
          if (
            existingArtifact.status === "ready" ||
            (existingArtifact.leaseExpiresAt &&
              Date.parse(existingArtifact.leaseExpiresAt) > Date.now())
          ) {
            return { artifact: existingArtifact, claimed: false };
          }
          await tx
            .update(buildArtifacts)
            .set({ status: "building", leaseExpiresAt: new Date(leaseExpiresAt) })
            .where(eq(buildArtifacts.artifactId, artifact.artifactId));
          return {
            artifact: { ...existingArtifact, status: "building", leaseExpiresAt },
            claimed: true
          };
        }
        const buildingArtifact = { ...artifact, status: "building" as const, leaseExpiresAt };
        await tx.insert(buildArtifacts).values({
          ...buildingArtifact,
          leaseExpiresAt: new Date(leaseExpiresAt),
          createdAt: new Date(artifact.createdAt)
        });
        await tx.insert(auditLogs).values({
          actorId: artifact.createdBy,
          action: "artifact.created",
          siteId: artifact.siteId,
          targetId: artifact.artifactId
        });
        return { artifact: buildingArtifact, claimed: true };
      });
    },

    async markArtifactReady(artifactId) {
      await db
        .update(buildArtifacts)
        .set({ status: "ready", leaseExpiresAt: null })
        .where(eq(buildArtifacts.artifactId, artifactId));
      const [row] = await db.select().from(buildArtifacts).where(eq(buildArtifacts.artifactId, artifactId));
      return row ? asArtifact(row) : undefined;
    },

    async createDeployment(deployment) {
      try {
        await db.transaction(async (tx) => {
          const { leaseExpiresAt, ...deploymentValues } = deployment;
          await tx.insert(deployments).values({
            ...deploymentValues,
            artifactId: deployment.artifactId ?? null,
            previewUrl: deployment.previewUrl ?? null,
            errorSummary: deployment.errorSummary ?? null,
            leaseExpiresAt: leaseExpiresAt ? new Date(leaseExpiresAt) : null,
            createdAt: new Date(deployment.createdAt),
            updatedAt: new Date(deployment.updatedAt)
          });
          await tx.insert(auditLogs).values({
            actorId: deployment.createdBy,
            action: "deployment.created",
            siteId: deployment.siteId,
            targetId: deployment.deploymentId
          });
        });
        return { deployment, created: true };
      } catch (error) {
        if (!isDuplicateEntryError(error)) throw error;
        const [existing] = await db
          .select()
          .from(deployments)
          .where(
            and(
              eq(deployments.siteId, deployment.siteId),
              eq(deployments.idempotencyKey, deployment.idempotencyKey)
            )
          );
        if (!existing) throw error;
        return { deployment: asDeployment(existing), created: false };
      }
    },

    async getDeployment(siteId, jobId) {
      const [row] = await db
        .select()
        .from(deployments)
        .where(and(eq(deployments.siteId, siteId), eq(deployments.jobId, jobId)));
      return row ? asDeployment(row) : undefined;
    },

    async claimNextDeployment(leaseExpiresAt) {
      return db.transaction(async (tx) => {
        const now = new Date();
        const [deployment] = await tx
          .select()
          .from(deployments)
          .where(
            or(
              eq(deployments.status, "queued"),
              and(
                inArray(deployments.status, ["building", "deploying"]),
                or(isNull(deployments.leaseExpiresAt), lt(deployments.leaseExpiresAt, now))
              )
            )
          )
          .orderBy(deployments.createdAt)
          .limit(1)
          .for("update");
        if (!deployment) return undefined;
        await tx
          .update(deployments)
          .set({ status: "building", leaseExpiresAt: new Date(leaseExpiresAt) })
          .where(eq(deployments.jobId, deployment.jobId));
        return asDeployment({
          ...deployment,
          status: "building",
          leaseExpiresAt: new Date(leaseExpiresAt)
        });
      });
    },

    async updateDeployment(siteId, jobId, patch) {
      const { leaseExpiresAt, ...patchValues } = patch;
      await db
        .update(deployments)
        .set({
          ...patchValues,
          ...(leaseExpiresAt
            ? { leaseExpiresAt: new Date(leaseExpiresAt) }
            : patch.status === "healthy" || patch.status === "failed" || patch.status === "queued"
              ? { leaseExpiresAt: null }
              : {}),
          updatedAt: new Date()
        })
        .where(and(eq(deployments.siteId, siteId), eq(deployments.jobId, jobId)));
      const [row] = await db
        .select()
        .from(deployments)
        .where(and(eq(deployments.siteId, siteId), eq(deployments.jobId, jobId)));
      return row ? asDeployment(row) : undefined;
    },

    async recordAudit(actorId, action, siteId, targetId) {
      await db.insert(auditLogs).values({ actorId, action, siteId, targetId });
    },

    async getAuditLogs(siteId) {
      const rows = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.siteId, siteId))
        .orderBy(desc(auditLogs.createdAt));
      return rows.map(
        (row): AuditLog => ({
          actorId: row.actorId,
          action: row.action,
          siteId: row.siteId,
          targetId: row.targetId,
          createdAt: row.createdAt.toISOString()
        })
      );
    },

    async close() {
      await pool.end();
    }
  };
}
