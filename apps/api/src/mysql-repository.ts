import mysql from "mysql2/promise";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { SiteConfig } from "@zhansite/site-config";
import { auditLogs, siteRevisions, sites } from "./db-schema.js";
import {
  SiteAlreadyExistsError,
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

export const isDuplicateEntryError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ER_DUP_ENTRY";

export function createMySqlRepository(databaseUrl: string): SiteRepository {
  const pool = mysql.createPool(databaseUrl);
  const db = drizzle({ client: pool });

  return {
    async createSite(site, actorId) {
      try {
        await db.transaction(async (tx) => {
          await tx.insert(sites).values({ ...site, currentRevision: 0 });
          await tx.insert(auditLogs).values({
            actorId,
            action: "site.created",
            siteId: site.siteId,
            targetId: site.siteId
          });
        });
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          throw new SiteAlreadyExistsError(site.siteId);
        }
        throw error;
      }
      return { ...site, currentRevision: 0 };
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
    }
  };
}
