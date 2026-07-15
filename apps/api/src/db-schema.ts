import {
  int,
  json,
  mysqlTable,
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
