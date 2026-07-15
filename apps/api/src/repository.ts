import type { SiteConfig } from "@zhansite/site-config";

export type Site = {
  siteId: string;
  name: string;
  template: "b2b-manufacturing-v1";
  currentRevision: number;
};

export type SiteRevision = {
  siteId: string;
  revision: number;
  schemaVersion: "1.0";
  config: SiteConfig;
  createdBy: string;
  createdAt: string;
};

export type SiteRepository = {
  createSite(site: Omit<Site, "currentRevision">, actorId: string): Promise<Site>;
  listSites(): Promise<Site[]>;
  getSite(siteId: string): Promise<Site | undefined>;
  getRevisions(siteId: string): Promise<SiteRevision[]>;
  createRevision(
    siteId: string,
    expectedRevision: number,
    config: SiteConfig,
    actorId: string
  ): Promise<{ kind: "created"; revision: SiteRevision } | { kind: "conflict"; currentRevision: number } | { kind: "not_found" }>;
};

export class SiteAlreadyExistsError extends Error {
  constructor(siteId: string) {
    super(`Site already exists: ${siteId}`);
    this.name = "SiteAlreadyExistsError";
  }
}

export class InMemorySiteRepository implements SiteRepository {
  private readonly sites = new Map<string, Site>();
  private readonly revisions = new Map<string, SiteRevision[]>();

  async createSite(site: Omit<Site, "currentRevision">, _actorId: string): Promise<Site> {
    if (this.sites.has(site.siteId)) {
      throw new SiteAlreadyExistsError(site.siteId);
    }

    const created = { ...site, currentRevision: 0 };
    this.sites.set(created.siteId, created);
    this.revisions.set(created.siteId, []);
    return created;
  }

  async listSites(): Promise<Site[]> {
    return [...this.sites.values()];
  }

  async getSite(siteId: string): Promise<Site | undefined> {
    return this.sites.get(siteId);
  }

  async getRevisions(siteId: string): Promise<SiteRevision[]> {
    return this.revisions.get(siteId) ?? [];
  }

  async createRevision(
    siteId: string,
    expectedRevision: number,
    config: SiteConfig,
    actorId: string
  ): Promise<
    | { kind: "created"; revision: SiteRevision }
    | { kind: "conflict"; currentRevision: number }
    | { kind: "not_found" }
  > {
    const site = this.sites.get(siteId);
    if (!site) return { kind: "not_found" };
    if (site.currentRevision !== expectedRevision) {
      return { kind: "conflict", currentRevision: site.currentRevision };
    }

    const revision: SiteRevision = {
      siteId,
      revision: expectedRevision + 1,
      schemaVersion: "1.0",
      config,
      createdBy: actorId,
      createdAt: new Date().toISOString()
    };

    site.currentRevision = revision.revision;
    this.revisions.get(siteId)?.push(revision);
    return { kind: "created", revision };
  }
}
