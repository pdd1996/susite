import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import mysql from "mysql2/promise";
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { SiteConfig } from "@zhansite/site-config";
import {
  assets,
  auditLogs,
  buildArtifacts,
  deploymentEvents,
  deployments,
  reviewRecords,
  sitePreviewStates,
  siteRevisions,
  sites
} from "./db-schema.js";
import {
  SiteAlreadyExistsError,
  type Asset,
  type AuditLog,
  type BuildArtifact,
  type Deployment,
  type DeploymentEvent,
  type ReviewChannel,
  type ReviewKind,
  type ReviewOutcome,
  type ReviewRecord,
  type SitePreviewState,
  type Site,
  type SiteRepository,
  type SiteRevision
} from "./repository.js";

const expectDatabaseValue = <T extends string>(
  value: string,
  allowed: readonly T[],
  column: string
): T => {
  if (!allowed.includes(value as T)) {
    throw new Error(`Unsupported database value for ${column}: ${value}`);
  }
  return value as T;
};

const asSite = (row: typeof sites.$inferSelect): Site => ({
  siteId: row.siteId,
  name: row.name,
  template: expectDatabaseValue(row.template, ["b2b-manufacturing-v1"] as const, "sites.template"),
  currentRevision: row.currentRevision
});

const asRevision = (row: typeof siteRevisions.$inferSelect): SiteRevision => ({
  siteId: row.siteId,
  revision: row.revision,
  schemaVersion: expectDatabaseValue(
    row.schemaVersion,
    ["1.0"] as const,
    "site_revisions.schema_version"
  ),
  config: row.config as SiteConfig,
  contentStatus: expectDatabaseValue(
    row.contentStatus,
    ["draft", "review_requested", "approved", "archived"] as const,
    "site_revisions.content_status"
  ),
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString()
});

const asAsset = (row: typeof assets.$inferSelect): Asset => ({
  assetId: row.assetId,
  siteId: row.siteId,
  type: expectDatabaseValue(
    row.type,
    ["logo", "product_image", "certificate_image", "product_pdf", "wechat_qr", "factory_image"],
    "assets.type"
  ),
  status: expectDatabaseValue(row.status, ["verified"] as const, "assets.status"),
  sourceKind: expectDatabaseValue(
    row.sourceKind,
    ["customer_provided", "placeholder"] as const,
    "assets.source_kind"
  ),
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
  template: expectDatabaseValue(
    row.template,
    ["b2b-manufacturing-v1"] as const,
    "build_artifacts.template"
  ),
  templateVersion: row.templateVersion,
  inputChecksum: row.inputChecksum,
  location: row.location,
  status: expectDatabaseValue(row.status, ["building", "ready"] as const, "build_artifacts.status"),
  ...(row.leaseExpiresAt ? { leaseExpiresAt: row.leaseExpiresAt.toISOString() } : {}),
  leaseToken: row.leaseToken,
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString()
});

const asDeployment = (row: typeof deployments.$inferSelect): Deployment => ({
  deploymentId: row.deploymentId,
  jobId: row.jobId,
  siteId: row.siteId,
  revision: row.revision,
  ...(row.artifactId ? { artifactId: row.artifactId } : {}),
  ...(row.targetArtifactId ? { targetArtifactId: row.targetArtifactId } : {}),
  kind: expectDatabaseValue(row.kind, ["publish", "rollback"] as const, "deployments.kind"),
  environment: expectDatabaseValue(row.environment, ["preview"] as const, "deployments.environment"),
  idempotencyKey: row.idempotencyKey,
  status: expectDatabaseValue(
    row.status,
    ["queued", "building", "deploying", "retry_waiting", "healthy", "failed"] as const,
    "deployments.status"
  ),
  placeholderAssetIds: row.placeholderAssetIds,
  ...(row.previewUrl ? { previewUrl: row.previewUrl } : {}),
  ...(row.errorSummary ? { errorSummary: row.errorSummary } : {}),
  attemptCount: row.attemptCount,
  maxAttempts: row.maxAttempts,
  ...(row.nextAttemptAt ? { nextAttemptAt: row.nextAttemptAt.toISOString() } : {}),
  ...(row.lastErrorCode ? { lastErrorCode: row.lastErrorCode } : {}),
  ...(row.lastErrorClass
    ? {
        lastErrorClass: expectDatabaseValue(
          row.lastErrorClass,
          ["transient", "permanent", "concurrency"] as const,
          "deployments.last_error_class"
        )
      }
    : {}),
  ...(row.leaseExpiresAt ? { leaseExpiresAt: row.leaseExpiresAt.toISOString() } : {}),
  leaseToken: row.leaseToken,
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

const asPreviewState = (row: typeof sitePreviewStates.$inferSelect): SitePreviewState => ({
  siteId: row.siteId,
  environment: expectDatabaseValue(row.environment, ["preview"] as const, "site_preview_states.environment"),
  activeArtifactId: row.activeArtifactId,
  activeDeploymentId: row.activeDeploymentId,
  previewUrl: row.previewUrl,
  version: row.version,
  activatedAt: row.activatedAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

const asDeploymentEvent = (row: typeof deploymentEvents.$inferSelect): DeploymentEvent => ({
  eventId: row.eventId,
  deploymentId: row.deploymentId,
  siteId: row.siteId,
  attempt: row.attempt,
  sequence: row.sequence,
  stage: row.stage,
  level: expectDatabaseValue(row.level, ["info", "warn", "error"] as const, "deployment_events.level"),
  code: row.code,
  message: row.message,
  createdAt: row.createdAt.toISOString()
});

const asReviewRecord = (row: typeof reviewRecords.$inferSelect): ReviewRecord => ({
  reviewId: row.reviewId,
  siteId: row.siteId,
  revision: row.revision,
  deploymentId: row.deploymentId,
  kind: expectDatabaseValue(
    row.kind,
    ["preview_sent", "customer_feedback", "customer_confirmed"] as const,
    "review_records.kind"
  ),
  outcome: expectDatabaseValue(
    row.outcome,
    ["pending", "changes_requested", "approved"] as const,
    "review_records.outcome"
  ),
  channel: expectDatabaseValue(
    row.channel,
    ["wechat", "phone", "email", "in_person", "other"] as const,
    "review_records.channel"
  ),
  previewUrl: row.previewUrl,
  note: row.note,
  recordedBy: row.recordedBy,
  recordedAt: row.recordedAt.toISOString()
});

const mysqlErrorCode = (error: unknown): string | undefined => {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
};

export const isDuplicateEntryError = (error: unknown): boolean =>
  mysqlErrorCode(error) === "ER_DUP_ENTRY";

const isArtifactClaimRaceError = (error: unknown): boolean =>
  isDuplicateEntryError(error) ||
  mysqlErrorCode(error) === "ER_LOCK_DEADLOCK" ||
  mysqlErrorCode(error) === "ER_LOCK_WAIT_TIMEOUT";

export function createMySqlRepository(databaseUrl: string): SiteRepository {
  const pool = mysql.createPool({ uri: databaseUrl, timezone: "Z" });
  pool.on("connection", (connection) => {
    void connection.query("SET time_zone = '+00:00'");
  });
  const db = drizzle({ client: pool });

  return {
    async createSite(site, initialConfig, actorId) {
      const revision: SiteRevision = {
        siteId: site.siteId,
        revision: 1,
        schemaVersion: "1.0",
        config: initialConfig,
        contentStatus: "draft",
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
            contentStatus: "draft",
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
          contentStatus: "draft",
          createdBy: actorId,
          createdAt: new Date().toISOString()
        };
        await tx.insert(siteRevisions).values({
          siteId,
          revision: revision.revision,
          schemaVersion: revision.schemaVersion,
          config,
          contentStatus: "draft",
          createdBy: actorId
        });
        const [updateResult] = await tx
          .update(sites)
          .set({ currentRevision: revision.revision })
          .where(and(eq(sites.siteId, siteId), eq(sites.currentRevision, expectedRevision)));
        if (updateResult.affectedRows !== 1) {
          throw new Error("revision_pointer_update_conflict");
        }
        await tx.insert(auditLogs).values({
          actorId,
          action: "revision.created",
          siteId,
          targetId: `${siteId}:${revision.revision}`
        });
        return { kind: "created" as const, revision };
      });
    },

    async archiveRevision(siteId, revisionNumber, expectedStatus, actorId) {
      return db.transaction(async (tx) => {
        const [site] = await tx.select().from(sites).where(eq(sites.siteId, siteId)).for("update");
        if (!site) return { kind: "site_not_found" as const };
        const [row] = await tx
          .select()
          .from(siteRevisions)
          .where(
            and(
              eq(siteRevisions.siteId, siteId),
              eq(siteRevisions.revision, revisionNumber)
            )
          )
          .for("update");
        if (!row) return { kind: "revision_not_found" as const };
        const revision = asRevision(row);
        if (site.currentRevision === revisionNumber) return { kind: "current_revision" as const };
        if (revision.contentStatus !== expectedStatus) {
          return { kind: "status_conflict" as const, currentStatus: revision.contentStatus };
        }
        if (revision.contentStatus === "archived") return { kind: "transition_invalid" as const };
        const [updated] = await tx
          .update(siteRevisions)
          .set({ contentStatus: "archived" })
          .where(
            and(
              eq(siteRevisions.siteId, siteId),
              eq(siteRevisions.revision, revisionNumber),
              eq(siteRevisions.contentStatus, expectedStatus)
            )
          );
        if (updated.affectedRows !== 1) {
          return { kind: "status_conflict" as const, currentStatus: revision.contentStatus };
        }
        await tx.insert(auditLogs).values({
          actorId,
          action: "revision.archived",
          siteId,
          targetId: `${siteId}:${revisionNumber}`
        });
        return {
          kind: "updated" as const,
          revision: { ...revision, contentStatus: "archived" as const }
        };
      });
    },

    async createReviewRecord(input) {
      return db.transaction(async (tx) => {
        const [site] = await tx
          .select({ siteId: sites.siteId })
          .from(sites)
          .where(eq(sites.siteId, input.siteId));
        if (!site) return { kind: "site_not_found" as const };
        const [revisionRow] = await tx
          .select()
          .from(siteRevisions)
          .where(
            and(
              eq(siteRevisions.siteId, input.siteId),
              eq(siteRevisions.revision, input.revision)
            )
          )
          .for("update");
        if (!revisionRow) return { kind: "revision_not_found" as const };
        const revision = asRevision(revisionRow);
        const [deployment] = await tx
          .select()
          .from(deployments)
          .where(
            and(
              eq(deployments.deploymentId, input.deploymentId),
              eq(deployments.siteId, input.siteId),
              eq(deployments.revision, input.revision),
              eq(deployments.status, "healthy")
            )
          );
        if (!deployment?.previewUrl) return { kind: "deployment_not_found" as const };
        if (revision.contentStatus !== input.expectedStatus) {
          return { kind: "status_conflict" as const, currentStatus: revision.contentStatus };
        }
        const transitions: Record<
          ReviewKind,
          { from: typeof revision.contentStatus; to: typeof revision.contentStatus; outcome: ReviewOutcome }
        > = {
          preview_sent: { from: "draft", to: "review_requested", outcome: "pending" },
          customer_feedback: {
            from: "review_requested",
            to: "draft",
            outcome: "changes_requested"
          },
          customer_confirmed: {
            from: "review_requested",
            to: "approved",
            outcome: "approved"
          }
        };
        const transition = transitions[input.kind];
        if (revision.contentStatus !== transition.from) return { kind: "transition_invalid" as const };
        if (input.kind !== "preview_sent") {
          const [sentRecord] = await tx
            .select({ deploymentId: reviewRecords.deploymentId })
            .from(reviewRecords)
            .where(
              and(
                eq(reviewRecords.siteId, input.siteId),
                eq(reviewRecords.revision, input.revision),
                eq(reviewRecords.kind, "preview_sent")
              )
            )
            .orderBy(desc(reviewRecords.recordedAt), desc(reviewRecords.reviewId))
            .limit(1);
          if (!sentRecord || sentRecord.deploymentId !== input.deploymentId) {
            return { kind: "review_deployment_mismatch" as const };
          }
        }
        const recordedAt = new Date();
        const record: ReviewRecord = {
          reviewId: `review_${randomUUID()}`,
          siteId: input.siteId,
          revision: input.revision,
          deploymentId: input.deploymentId,
          kind: input.kind,
          outcome: transition.outcome,
          channel: input.channel as ReviewChannel,
          previewUrl: deployment.previewUrl,
          note: input.note,
          recordedBy: input.actorId,
          recordedAt: recordedAt.toISOString()
        };
        await tx.insert(reviewRecords).values({ ...record, recordedAt });
        const [updated] = await tx
          .update(siteRevisions)
          .set({ contentStatus: transition.to })
          .where(
            and(
              eq(siteRevisions.siteId, input.siteId),
              eq(siteRevisions.revision, input.revision),
              eq(siteRevisions.contentStatus, input.expectedStatus)
            )
          );
        if (updated.affectedRows !== 1) {
          throw new Error("review_status_update_conflict");
        }
        await tx.insert(auditLogs).values([
          {
            actorId: input.actorId,
            action: "review.created",
            siteId: input.siteId,
            targetId: record.reviewId
          },
          {
            actorId: input.actorId,
            action: `revision.status.${transition.to}`,
            siteId: input.siteId,
            targetId: `${input.siteId}:${input.revision}`
          }
        ]);
        return {
          kind: "created" as const,
          record,
          revision: { ...revision, contentStatus: transition.to }
        };
      });
    },

    async listReviewRecords(siteId, revision) {
      const where = revision === undefined
        ? eq(reviewRecords.siteId, siteId)
        : and(eq(reviewRecords.siteId, siteId), eq(reviewRecords.revision, revision));
      return (
        await db
          .select()
          .from(reviewRecords)
          .where(where)
          .orderBy(asc(reviewRecords.recordedAt), asc(reviewRecords.reviewId))
      ).map(asReviewRecord);
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
        const [existing] = await db
          .select()
          .from(assets)
          .where(
            or(eq(assets.assetId, asset.assetId), eq(assets.objectKey, asset.objectKey))
          );
        if (
          !existing ||
          existing.siteId !== asset.siteId ||
          existing.assetId !== asset.assetId ||
          existing.objectKey !== asset.objectKey ||
          existing.checksumSha256 !== asset.checksumSha256
        ) {
          throw error;
        }
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
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await db.transaction(async (tx) => {
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
              const nextLeaseToken = existing.leaseToken + 1;
              await tx
                .update(buildArtifacts)
                .set({
                  status: "building",
                  leaseExpiresAt: new Date(leaseExpiresAt),
                  leaseToken: nextLeaseToken
                })
                .where(eq(buildArtifacts.artifactId, artifact.artifactId));
              return {
                artifact: {
                  ...existingArtifact,
                  status: "building",
                  leaseExpiresAt,
                  leaseToken: nextLeaseToken
                },
                claimed: true
              };
            }
            const buildingArtifact = {
              ...artifact,
              status: "building" as const,
              leaseExpiresAt,
              leaseToken: 1
            };
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
        } catch (error) {
          if (!isArtifactClaimRaceError(error)) throw error;
          lastError = error;
          const [existing] = await db
            .select()
            .from(buildArtifacts)
            .where(eq(buildArtifacts.artifactId, artifact.artifactId));
          if (existing) return { artifact: asArtifact(existing), claimed: false };
        }
      }
      throw lastError;
    },

    async markArtifactReady(artifactId, leaseToken) {
      const [updateResult] = await db
        .update(buildArtifacts)
        .set({ status: "ready", leaseExpiresAt: null })
        .where(
          and(
            eq(buildArtifacts.artifactId, artifactId),
            eq(buildArtifacts.status, "building"),
            eq(buildArtifacts.leaseToken, leaseToken),
            sql`${buildArtifacts.leaseExpiresAt} > CURRENT_TIMESTAMP`
          )
        );
      if (updateResult.affectedRows !== 1) return undefined;
      const [row] = await db
        .select()
        .from(buildArtifacts)
        .where(
          and(
            eq(buildArtifacts.artifactId, artifactId),
            eq(buildArtifacts.status, "ready"),
            eq(buildArtifacts.leaseToken, leaseToken)
          )
        );
      return row ? asArtifact(row) : undefined;
    },

    async getArtifact(siteId, artifactId) {
      const [row] = await db
        .select()
        .from(buildArtifacts)
        .where(and(eq(buildArtifacts.siteId, siteId), eq(buildArtifacts.artifactId, artifactId)));
      return row ? asArtifact(row) : undefined;
    },

    async listReadyArtifacts(siteId) {
      return (
        await db
          .select()
          .from(buildArtifacts)
          .where(and(eq(buildArtifacts.siteId, siteId), eq(buildArtifacts.status, "ready")))
          .orderBy(desc(buildArtifacts.createdAt))
      ).map(asArtifact);
    },

    async createDeployment(deployment) {
      try {
        await db.transaction(async (tx) => {
          const { leaseExpiresAt, nextAttemptAt, ...deploymentValues } = deployment;
          await tx.insert(deployments).values({
            ...deploymentValues,
            artifactId: deployment.artifactId ?? null,
            targetArtifactId: deployment.targetArtifactId ?? null,
            kind: deployment.kind ?? "publish",
            attemptCount: deployment.attemptCount ?? 0,
            maxAttempts: deployment.maxAttempts ?? 3,
            previewUrl: deployment.previewUrl ?? null,
            errorSummary: deployment.errorSummary ?? null,
            nextAttemptAt: nextAttemptAt ? new Date(nextAttemptAt) : null,
            lastErrorCode: deployment.lastErrorCode ?? null,
            lastErrorClass: deployment.lastErrorClass ?? null,
            leaseExpiresAt: leaseExpiresAt ? new Date(leaseExpiresAt) : null,
            leaseToken: deployment.leaseToken ?? 0,
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
              eq(deployments.kind, deployment.kind ?? "publish"),
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

    async failExpiredDeployments(now) {
      return db.transaction(async (tx) => {
        const expired = await tx
          .select()
          .from(deployments)
          .where(
            and(
              inArray(deployments.status, ["building", "deploying"]),
              lt(deployments.leaseExpiresAt, new Date(now)),
              gte(deployments.attemptCount, deployments.maxAttempts)
            )
          )
          .for("update");
        if (expired.length === 0) return [];
        await tx
          .update(deployments)
          .set({
            status: "failed",
            leaseExpiresAt: null,
            errorSummary: "已达到最大重试次数",
            lastErrorCode: "attempts_exhausted",
            lastErrorClass: "transient",
            updatedAt: new Date(now)
          })
          .where(
            and(
              inArray(deployments.status, ["building", "deploying"]),
              lt(deployments.leaseExpiresAt, new Date(now)),
              gte(deployments.attemptCount, deployments.maxAttempts)
            )
          );
        return expired.map((deployment) =>
          asDeployment({
            ...deployment,
            status: "failed",
            leaseExpiresAt: null,
            errorSummary: "已达到最大重试次数",
            lastErrorCode: "attempts_exhausted",
            lastErrorClass: "transient",
            updatedAt: new Date(now)
          })
        );
      });
    },

    async claimNextDeployment(leaseExpiresAt) {
      let lastContention: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await db.transaction(async (tx) => {
          const now = new Date();
          const [deployment] = await tx
            .select()
            .from(deployments)
            .where(
              or(
                eq(deployments.status, "queued"),
                and(
                  eq(deployments.status, "retry_waiting"),
                  or(isNull(deployments.nextAttemptAt), lt(deployments.nextAttemptAt, now)),
                  lt(deployments.attemptCount, deployments.maxAttempts)
                ),
                and(
                  inArray(deployments.status, ["building", "deploying"]),
                  or(isNull(deployments.leaseExpiresAt), lt(deployments.leaseExpiresAt, now)),
                  lt(deployments.attemptCount, deployments.maxAttempts)
                )
              )
            )
            .orderBy(deployments.createdAt)
            .limit(1)
            .for("update");
          if (!deployment) return undefined;
          const nextLeaseToken = deployment.leaseToken + 1;
          const [claimResult] = await tx
            .update(deployments)
            .set({
              status: "building",
              leaseExpiresAt: new Date(leaseExpiresAt),
              leaseToken: nextLeaseToken,
              attemptCount: deployment.attemptCount + 1,
              nextAttemptAt: null
            })
            .where(
              and(
                eq(deployments.jobId, deployment.jobId),
                eq(deployments.leaseToken, deployment.leaseToken)
              )
            );
          if (claimResult.affectedRows !== 1) return undefined;
          return asDeployment({
            ...deployment,
            status: "building",
            leaseExpiresAt: new Date(leaseExpiresAt),
            leaseToken: nextLeaseToken,
            attemptCount: deployment.attemptCount + 1,
            nextAttemptAt: null
          });
          });
        } catch (error) {
          const code = mysqlErrorCode(error);
          if (code !== "ER_LOCK_DEADLOCK" && code !== "ER_LOCK_WAIT_TIMEOUT") throw error;
          lastContention = error;
          if (attempt < 2) await delay((attempt + 1) * 10);
        }
      }
      throw lastContention;
    },

    async updateDeployment(siteId, jobId, leaseToken, patch) {
      const {
        leaseExpiresAt,
        nextAttemptAt,
        errorSummary,
        lastErrorCode,
        lastErrorClass,
        ...patchValues
      } = patch;
      const [updateResult] = await db
        .update(deployments)
        .set({
          ...patchValues,
          ...("errorSummary" in patch ? { errorSummary: errorSummary ?? null } : {}),
          ...("lastErrorCode" in patch ? { lastErrorCode: lastErrorCode ?? null } : {}),
          ...("lastErrorClass" in patch ? { lastErrorClass: lastErrorClass ?? null } : {}),
          ...(nextAttemptAt !== undefined
            ? { nextAttemptAt: nextAttemptAt ? new Date(nextAttemptAt) : null }
            : {}),
          ...(leaseExpiresAt
            ? { leaseExpiresAt: new Date(leaseExpiresAt) }
            : patch.status === "healthy" ||
                patch.status === "failed" ||
                patch.status === "queued" ||
                patch.status === "retry_waiting"
              ? { leaseExpiresAt: null }
              : {}),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(deployments.siteId, siteId),
            eq(deployments.jobId, jobId),
            eq(deployments.leaseToken, leaseToken),
            sql`${deployments.leaseExpiresAt} > CURRENT_TIMESTAMP`
          )
        );
      if (updateResult.affectedRows !== 1) return undefined;
      const [row] = await db
        .select()
        .from(deployments)
        .where(
          and(
            eq(deployments.siteId, siteId),
            eq(deployments.jobId, jobId),
            eq(deployments.leaseToken, leaseToken)
          )
        );
      return row ? asDeployment(row) : undefined;
    },

    async getPreviewState(siteId) {
      const [row] = await db
        .select()
        .from(sitePreviewStates)
        .where(
          and(eq(sitePreviewStates.siteId, siteId), eq(sitePreviewStates.environment, "preview"))
        );
      return row ? asPreviewState(row) : undefined;
    },

    async activatePreview(input) {
      try {
        return await db.transaction(async (tx) => {
        const [deployment] = await tx
          .select()
          .from(deployments)
          .where(
            and(
              eq(deployments.deploymentId, input.deploymentId),
              eq(deployments.siteId, input.siteId)
            )
          )
          .for("update");
        if (
          !deployment ||
          deployment.leaseToken !== input.leaseToken ||
          !deployment.leaseExpiresAt ||
          deployment.leaseExpiresAt.getTime() <= Date.now()
        ) return "lease_lost" as const;
        const [artifact] = await tx
          .select()
          .from(buildArtifacts)
          .where(
            and(
              eq(buildArtifacts.artifactId, input.artifactId),
              eq(buildArtifacts.siteId, input.siteId),
              eq(buildArtifacts.status, "ready")
            )
          );
        if (!artifact) return "activation_conflict" as const;
        const [current] = await tx
          .select()
          .from(sitePreviewStates)
          .where(
            and(
              eq(sitePreviewStates.siteId, input.siteId),
              eq(sitePreviewStates.environment, "preview")
            )
          )
          .for("update");
        if (
          current?.activeDeploymentId === input.deploymentId &&
          current.activeArtifactId === input.artifactId
        ) return "already_activated" as const;
        if ((current?.version ?? 0) !== input.expectedVersion) {
          return "activation_conflict" as const;
        }
        if (!current) {
          await tx.insert(sitePreviewStates).values({
            siteId: input.siteId,
            environment: "preview",
            activeArtifactId: input.artifactId,
            activeDeploymentId: input.deploymentId,
            previewUrl: input.previewUrl,
            version: 1,
            activatedAt: new Date(input.activatedAt),
            updatedAt: new Date(input.activatedAt)
          });
        } else {
          const [result] = await tx
            .update(sitePreviewStates)
            .set({
              activeArtifactId: input.artifactId,
              activeDeploymentId: input.deploymentId,
              previewUrl: input.previewUrl,
              version: input.expectedVersion + 1,
              activatedAt: new Date(input.activatedAt),
              updatedAt: new Date(input.activatedAt)
            })
            .where(
              and(
                eq(sitePreviewStates.siteId, input.siteId),
                eq(sitePreviewStates.environment, "preview"),
                eq(sitePreviewStates.version, input.expectedVersion)
              )
            );
          if (result.affectedRows !== 1) return "activation_conflict" as const;
        }
          return "activated" as const;
        });
      } catch (error) {
        if (
          isDuplicateEntryError(error) ||
          mysqlErrorCode(error) === "ER_LOCK_DEADLOCK" ||
          mysqlErrorCode(error) === "ER_LOCK_WAIT_TIMEOUT"
        ) {
          return "activation_conflict" as const;
        }
        throw error;
      }
    },

    async appendDeploymentEvent(event) {
      return db.transaction(async (tx) => {
        const [deployment] = await tx
          .select({ deploymentId: deployments.deploymentId })
          .from(deployments)
          .where(
            and(
              eq(deployments.deploymentId, event.deploymentId),
              eq(deployments.siteId, event.siteId)
            )
          )
          .for("update");
        if (!deployment) throw new Error("deployment_not_found");
        const rows = await tx
          .select({ sequence: deploymentEvents.sequence })
          .from(deploymentEvents)
          .where(
            and(
              eq(deploymentEvents.deploymentId, event.deploymentId),
              eq(deploymentEvents.attempt, event.attempt)
            )
          )
          .orderBy(desc(deploymentEvents.sequence))
          .limit(1);
        const created = {
          ...event,
          eventId: `event_${randomUUID()}`,
          sequence: (rows[0]?.sequence ?? 0) + 1,
          createdAt: new Date().toISOString()
        };
        await tx.insert(deploymentEvents).values({
          ...created,
          createdAt: new Date(created.createdAt)
        });
        return created;
      });
    },

    async listDeploymentEvents(siteId, jobId) {
      const [deployment] = await db
        .select({ deploymentId: deployments.deploymentId })
        .from(deployments)
        .where(and(eq(deployments.siteId, siteId), eq(deployments.jobId, jobId)));
      if (!deployment) return undefined;
      return (
        await db
          .select()
          .from(deploymentEvents)
          .where(
            and(
              eq(deploymentEvents.siteId, siteId),
              eq(deploymentEvents.deploymentId, deployment.deploymentId)
            )
          )
          .orderBy(asc(deploymentEvents.attempt), asc(deploymentEvents.sequence))
      ).map(asDeploymentEvent);
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
