import {
  bigint,
  check,
  foreignKey,
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import type { SiteConfig } from "@zhansite/site-config";

export const sites = mysqlTable("sites", {
  siteId: varchar("site_id", { length: 80 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  template: varchar("template", { length: 80 }).notNull(),
  currentRevision: int("current_revision").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow()
});

export const siteRevisions = mysqlTable(
  "site_revisions",
  {
    id: int("id").autoincrement().primaryKey(),
    siteId: varchar("site_id", { length: 80 })
      .notNull()
      .references(() => sites.siteId, { onDelete: "restrict", onUpdate: "cascade" }),
    revision: int("revision").notNull(),
    schemaVersion: varchar("schema_version", { length: 20 }).notNull(),
    config: json("config").$type<SiteConfig>().notNull(),
    createdBy: varchar("created_by", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (table) => [uniqueIndex("site_revisions_site_revision_uq").on(table.siteId, table.revision)]
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorId: varchar("actor_id", { length: 100 }).notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    siteId: varchar("site_id", { length: 80 })
      .notNull()
      .references(() => sites.siteId, { onDelete: "restrict", onUpdate: "cascade" }),
    targetId: varchar("target_id", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (table) => [index("audit_logs_site_created_idx").on(table.siteId, table.createdAt)]
);

export const assets = mysqlTable(
  "assets",
  {
    assetId: varchar("asset_id", { length: 110 }).primaryKey(),
    siteId: varchar("site_id", { length: 80 })
      .notNull()
      .references(() => sites.siteId, { onDelete: "restrict", onUpdate: "cascade" }),
    type: varchar("type", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    sourceKind: varchar("source_kind", { length: 30 }).notNull(),
    placeholderApprovedBy: varchar("placeholder_approved_by", { length: 100 }),
    placeholderApprovedAt: timestamp("placeholder_approved_at"),
    objectKey: varchar("object_key", { length: 512 }).notNull(),
    url: varchar("url", { length: 2048 }).notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number", unsigned: true }).notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    createdBy: varchar("created_by", { length: 100 }).notNull(),
    verifiedBy: varchar("verified_by", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    verifiedAt: timestamp("verified_at").notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("assets_object_key_uq").on(table.objectKey),
    index("assets_site_created_idx").on(table.siteId, table.createdAt),
    check(
      "assets_source_approval_ck",
      sql`(${table.sourceKind} = 'customer_provided' AND ${table.placeholderApprovedBy} IS NULL AND ${table.placeholderApprovedAt} IS NULL)
        OR (${table.sourceKind} = 'placeholder' AND (
          (${table.placeholderApprovedBy} IS NULL AND ${table.placeholderApprovedAt} IS NULL)
          OR (${table.placeholderApprovedBy} IS NOT NULL AND ${table.placeholderApprovedAt} IS NOT NULL)
        ))`
    ),
    check("assets_status_ck", sql`${table.status} = 'verified'`),
    check(
      "assets_type_ck",
      sql`${table.type} IN ('logo', 'product_image', 'certificate_image', 'product_pdf', 'wechat_qr', 'factory_image')`
    )
  ]
);

export const buildArtifacts = mysqlTable(
  "build_artifacts",
  {
    artifactId: varchar("artifact_id", { length: 110 }).primaryKey(),
    siteId: varchar("site_id", { length: 80 })
      .notNull()
      .references(() => sites.siteId, { onDelete: "restrict", onUpdate: "cascade" }),
    revision: int("revision").notNull(),
    template: varchar("template", { length: 80 }).notNull(),
    templateVersion: varchar("template_version", { length: 40 }).notNull(),
    inputChecksum: varchar("input_checksum", { length: 64 }).notNull(),
    location: varchar("location", { length: 512 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    leaseExpiresAt: timestamp("lease_expires_at"),
    leaseToken: bigint("lease_token", { mode: "number", unsigned: true }).notNull().default(0),
    createdBy: varchar("created_by", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("build_artifacts_input_uq").on(
      table.siteId,
      table.revision,
      table.templateVersion,
      table.inputChecksum
    ),
    uniqueIndex("build_artifacts_identity_uq").on(table.artifactId, table.siteId, table.revision),
    uniqueIndex("build_artifacts_site_identity_uq").on(table.artifactId, table.siteId),
    foreignKey({
      name: "build_artifacts_revision_fk",
      columns: [table.siteId, table.revision],
      foreignColumns: [siteRevisions.siteId, siteRevisions.revision]
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    check("build_artifacts_status_ck", sql`${table.status} IN ('building', 'ready')`)
  ]
);

export const deployments = mysqlTable(
  "deployments",
  {
    deploymentId: varchar("deployment_id", { length: 110 }).primaryKey(),
    jobId: varchar("job_id", { length: 110 }).notNull(),
    siteId: varchar("site_id", { length: 80 })
      .notNull()
      .references(() => sites.siteId, { onDelete: "restrict", onUpdate: "cascade" }),
    revision: int("revision").notNull(),
    artifactId: varchar("artifact_id", { length: 110 }),
    targetArtifactId: varchar("target_artifact_id", { length: 110 }),
    kind: varchar("kind", { length: 20 }).notNull().default("publish"),
    environment: varchar("environment", { length: 20 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    placeholderAssetIds: json("placeholder_asset_ids").$type<string[]>().notNull(),
    previewUrl: varchar("preview_url", { length: 2048 }),
    errorSummary: text("error_summary"),
    attemptCount: int("attempt_count", { unsigned: true }).notNull().default(0),
    maxAttempts: int("max_attempts", { unsigned: true }).notNull().default(3),
    nextAttemptAt: timestamp("next_attempt_at"),
    lastErrorCode: varchar("last_error_code", { length: 80 }),
    lastErrorClass: varchar("last_error_class", { length: 20 }),
    leaseExpiresAt: timestamp("lease_expires_at"),
    leaseToken: bigint("lease_token", { mode: "number", unsigned: true }).notNull().default(0),
    createdBy: varchar("created_by", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow()
  },
  (table) => [
    uniqueIndex("deployments_job_id_uq").on(table.jobId),
    uniqueIndex("deployments_site_kind_idempotency_uq").on(
      table.siteId,
      table.kind,
      table.idempotencyKey
    ),
    uniqueIndex("deployments_identity_uq").on(table.deploymentId, table.siteId),
    index("deployments_site_created_idx").on(table.siteId, table.createdAt),
    index("deployments_claim_idx").on(table.status, table.leaseExpiresAt, table.createdAt),
    foreignKey({
      name: "deployments_revision_fk",
      columns: [table.siteId, table.revision],
      foreignColumns: [siteRevisions.siteId, siteRevisions.revision]
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      name: "deployments_target_artifact_identity_fk",
      columns: [table.targetArtifactId, table.siteId, table.revision],
      foreignColumns: [buildArtifacts.artifactId, buildArtifacts.siteId, buildArtifacts.revision]
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    check("deployments_kind_ck", sql`${table.kind} IN ('publish', 'rollback')`),
    foreignKey({
      name: "deployments_artifact_identity_fk",
      columns: [table.artifactId, table.siteId, table.revision],
      foreignColumns: [buildArtifacts.artifactId, buildArtifacts.siteId, buildArtifacts.revision]
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    check("deployments_environment_ck", sql`${table.environment} = 'preview'`),
    check(
      "deployments_status_ck",
      sql`${table.status} IN ('queued', 'building', 'deploying', 'retry_waiting', 'healthy', 'failed')`
    ),
    check("deployments_attempts_ck", sql`${table.attemptCount} <= ${table.maxAttempts}`),
    check(
      "deployments_error_class_ck",
      sql`${table.lastErrorClass} IS NULL OR ${table.lastErrorClass} IN ('transient', 'permanent', 'concurrency')`
    )
  ]
);

export const sitePreviewStates = mysqlTable(
  "site_preview_states",
  {
    siteId: varchar("site_id", { length: 80 }).notNull(),
    environment: varchar("environment", { length: 20 }).notNull().default("preview"),
    activeArtifactId: varchar("active_artifact_id", { length: 110 }).notNull(),
    activeDeploymentId: varchar("active_deployment_id", { length: 110 }).notNull(),
    previewUrl: varchar("preview_url", { length: 2048 }).notNull(),
    version: bigint("version", { mode: "number", unsigned: true }).notNull().default(1),
    activatedAt: timestamp("activated_at").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow()
  },
  (table) => [
    uniqueIndex("site_preview_states_identity_uq").on(table.siteId, table.environment),
    foreignKey({
      name: "site_preview_states_site_fk",
      columns: [table.siteId],
      foreignColumns: [sites.siteId]
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
      name: "site_preview_states_artifact_fk",
      columns: [table.activeArtifactId, table.siteId],
      foreignColumns: [buildArtifacts.artifactId, buildArtifacts.siteId]
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
      name: "site_preview_states_deployment_fk",
      columns: [table.activeDeploymentId, table.siteId],
      foreignColumns: [deployments.deploymentId, deployments.siteId]
    }).onUpdate("cascade").onDelete("restrict"),
    check("site_preview_states_environment_ck", sql`${table.environment} = 'preview'`)
  ]
);

export const deploymentEvents = mysqlTable(
  "deployment_events",
  {
    eventId: varchar("event_id", { length: 140 }).primaryKey(),
    deploymentId: varchar("deployment_id", { length: 110 }).notNull(),
    siteId: varchar("site_id", { length: 80 }).notNull(),
    attempt: int("attempt", { unsigned: true }).notNull(),
    sequence: int("sequence", { unsigned: true }).notNull(),
    stage: varchar("stage", { length: 80 }).notNull(),
    level: varchar("level", { length: 20 }).notNull(),
    code: varchar("code", { length: 80 }).notNull(),
    message: varchar("message", { length: 500 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("deployment_events_order_uq").on(table.deploymentId, table.attempt, table.sequence),
    index("deployment_events_site_created_idx").on(table.siteId, table.createdAt),
    foreignKey({
      name: "deployment_events_deployment_fk",
      columns: [table.deploymentId, table.siteId],
      foreignColumns: [deployments.deploymentId, deployments.siteId]
    }).onUpdate("cascade").onDelete("restrict"),
    check("deployment_events_level_ck", sql`${table.level} IN ('info', 'warn', 'error')`)
  ]
);
