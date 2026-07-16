import {
  bigint,
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";
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

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  actorId: varchar("actor_id", { length: 100 }).notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  siteId: varchar("site_id", { length: 80 })
    .notNull()
    .references(() => sites.siteId, { onDelete: "restrict", onUpdate: "cascade" }),
  targetId: varchar("target_id", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

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
    index("assets_site_created_idx").on(table.siteId, table.createdAt)
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
    createdBy: varchar("created_by", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("build_artifacts_input_uq").on(
      table.siteId,
      table.revision,
      table.templateVersion,
      table.inputChecksum
    )
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
    artifactId: varchar("artifact_id", { length: 110 }).references(() => buildArtifacts.artifactId, {
      onDelete: "restrict",
      onUpdate: "cascade"
    }),
    environment: varchar("environment", { length: 20 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    placeholderAssetIds: json("placeholder_asset_ids").$type<string[]>().notNull(),
    previewUrl: varchar("preview_url", { length: 2048 }),
    errorSummary: text("error_summary"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    createdBy: varchar("created_by", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow()
  },
  (table) => [
    uniqueIndex("deployments_job_id_uq").on(table.jobId),
    uniqueIndex("deployments_site_idempotency_uq").on(table.siteId, table.idempotencyKey),
    index("deployments_site_created_idx").on(table.siteId, table.createdAt)
  ]
);
