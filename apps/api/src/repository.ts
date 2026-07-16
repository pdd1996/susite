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

export const assetTypes = [
  "logo",
  "product_image",
  "certificate_image",
  "product_pdf",
  "wechat_qr",
  "factory_image"
] as const;
export type AssetType = (typeof assetTypes)[number];
export type AssetSourceKind = "customer_provided" | "placeholder";

export type Asset = {
  assetId: string;
  siteId: string;
  type: AssetType;
  status: "verified";
  sourceKind: AssetSourceKind;
  placeholderApprovedBy?: string;
  placeholderApprovedAt?: string;
  objectKey: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  originalFilename: string;
  createdBy: string;
  verifiedBy: string;
  createdAt: string;
  verifiedAt: string;
};

export type BuildArtifact = {
  artifactId: string;
  siteId: string;
  revision: number;
  template: "b2b-manufacturing-v1";
  templateVersion: string;
  inputChecksum: string;
  location: string;
  status: "building" | "ready";
  leaseExpiresAt?: string;
  leaseToken?: number;
  createdBy: string;
  createdAt: string;
};

export type DeploymentStatus = "queued" | "building" | "deploying" | "healthy" | "failed";
export type Deployment = {
  deploymentId: string;
  jobId: string;
  siteId: string;
  revision: number;
  artifactId?: string;
  environment: "preview";
  idempotencyKey: string;
  status: DeploymentStatus;
  placeholderAssetIds: string[];
  previewUrl?: string;
  errorSummary?: string;
  leaseExpiresAt?: string;
  leaseToken?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
  actorId: string;
  action: string;
  siteId: string;
  targetId: string;
  createdAt: string;
};

export type SiteRepository = {
  createSite(
    site: Omit<Site, "currentRevision">,
    initialConfig: SiteConfig,
    actorId: string
  ): Promise<{ site: Site; revision: SiteRevision }>;
  listSites(): Promise<Site[]>;
  getSite(siteId: string): Promise<Site | undefined>;
  getRevisions(siteId: string): Promise<SiteRevision[]>;
  getRevision(siteId: string, revision: number): Promise<SiteRevision | undefined>;
  createRevision(
    siteId: string,
    expectedRevision: number,
    config: SiteConfig,
    actorId: string
  ): Promise<{ kind: "created"; revision: SiteRevision } | { kind: "conflict"; currentRevision: number } | { kind: "not_found" }>;
  createAsset(asset: Asset): Promise<Asset>;
  listAssets(siteId: string): Promise<Asset[]>;
  getAssetsByIds(assetIds: string[]): Promise<Asset[]>;
  claimArtifact(
    artifact: BuildArtifact,
    leaseExpiresAt: string
  ): Promise<{ artifact: BuildArtifact; claimed: boolean }>;
  markArtifactReady(artifactId: string, leaseToken: number): Promise<BuildArtifact | undefined>;
  createDeployment(deployment: Deployment): Promise<{ deployment: Deployment; created: boolean }>;
  getDeployment(siteId: string, jobId: string): Promise<Deployment | undefined>;
  claimNextDeployment(leaseExpiresAt: string): Promise<Deployment | undefined>;
  updateDeployment(
    siteId: string,
    jobId: string,
    leaseToken: number,
    patch: Partial<
      Pick<Deployment, "artifactId" | "status" | "previewUrl" | "errorSummary" | "leaseExpiresAt">
    >
  ): Promise<Deployment | undefined>;
  recordAudit(actorId: string, action: string, siteId: string, targetId: string): Promise<void>;
  getAuditLogs(siteId: string): Promise<AuditLog[]>;
  close?(): Promise<void>;
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
  private readonly assets = new Map<string, Asset>();
  private readonly artifacts = new Map<string, BuildArtifact>();
  private readonly deployments = new Map<string, Deployment>();
  private readonly audits: AuditLog[] = [];

  async createSite(
    site: Omit<Site, "currentRevision">,
    initialConfig: SiteConfig,
    actorId: string
  ): Promise<{ site: Site; revision: SiteRevision }> {
    if (this.sites.has(site.siteId)) {
      throw new SiteAlreadyExistsError(site.siteId);
    }

    const created = { ...site, currentRevision: 1 };
    const revision: SiteRevision = {
      siteId: site.siteId,
      revision: 1,
      schemaVersion: "1.0",
      config: initialConfig,
      createdBy: actorId,
      createdAt: new Date().toISOString()
    };
    this.sites.set(created.siteId, created);
    this.revisions.set(created.siteId, [revision]);
    this.audit(actorId, "site.created", site.siteId, site.siteId);
    this.audit(actorId, "revision.created", site.siteId, `${site.siteId}:1`);
    return { site: created, revision };
  }

  async listSites(): Promise<Site[]> {
    return [...this.sites.values()];
  }

  async getSite(siteId: string): Promise<Site | undefined> {
    return this.sites.get(siteId);
  }

  async getRevisions(siteId: string): Promise<SiteRevision[]> {
    return [...(this.revisions.get(siteId) ?? [])].sort((a, b) => b.revision - a.revision);
  }

  async getRevision(siteId: string, revision: number): Promise<SiteRevision | undefined> {
    return this.revisions.get(siteId)?.find((item) => item.revision === revision);
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
    this.audit(actorId, "revision.created", siteId, `${siteId}:${revision.revision}`);
    return { kind: "created", revision };
  }

  async createAsset(asset: Asset): Promise<Asset> {
    const existing = this.assets.get(asset.assetId);
    if (existing) return existing;
    this.assets.set(asset.assetId, asset);
    this.audit(asset.createdBy, "asset.verified", asset.siteId, asset.assetId);
    return asset;
  }

  async listAssets(siteId: string): Promise<Asset[]> {
    return [...this.assets.values()]
      .filter((asset) => asset.siteId === siteId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getAssetsByIds(assetIds: string[]): Promise<Asset[]> {
    const requested = new Set(assetIds);
    return [...this.assets.values()].filter((asset) => requested.has(asset.assetId));
  }

  async claimArtifact(
    artifact: BuildArtifact,
    leaseExpiresAt: string
  ): Promise<{ artifact: BuildArtifact; claimed: boolean }> {
    const existing = this.artifacts.get(artifact.artifactId);
    if (existing?.status === "ready") return { artifact: existing, claimed: false };
    if (existing?.leaseExpiresAt && Date.parse(existing.leaseExpiresAt) > Date.now()) {
      return { artifact: existing, claimed: false };
    }
    const claimed = {
      ...artifact,
      status: "building" as const,
      leaseExpiresAt,
      leaseToken: (existing?.leaseToken ?? 0) + 1
    };
    this.artifacts.set(artifact.artifactId, claimed);
    this.audit(artifact.createdBy, "artifact.created", artifact.siteId, artifact.artifactId);
    return { artifact: claimed, claimed: true };
  }

  async markArtifactReady(artifactId: string, leaseToken: number): Promise<BuildArtifact | undefined> {
    const artifact = this.artifacts.get(artifactId);
    if (
      !artifact ||
      artifact.status !== "building" ||
      artifact.leaseToken !== leaseToken ||
      !artifact.leaseExpiresAt ||
      Date.parse(artifact.leaseExpiresAt) <= Date.now()
    ) {
      return undefined;
    }
    const ready = { ...artifact, status: "ready" as const, leaseExpiresAt: undefined };
    this.artifacts.set(artifactId, ready);
    return ready;
  }

  async createDeployment(deployment: Deployment): Promise<{ deployment: Deployment; created: boolean }> {
    const existing = [...this.deployments.values()].find(
      (item) => item.siteId === deployment.siteId && item.idempotencyKey === deployment.idempotencyKey
    );
    if (existing) return { deployment: existing, created: false };
    this.deployments.set(deployment.jobId, deployment);
    this.audit(deployment.createdBy, "deployment.created", deployment.siteId, deployment.deploymentId);
    return { deployment, created: true };
  }

  async getDeployment(siteId: string, jobId: string): Promise<Deployment | undefined> {
    const deployment = this.deployments.get(jobId);
    return deployment?.siteId === siteId ? deployment : undefined;
  }

  async claimNextDeployment(leaseExpiresAt: string): Promise<Deployment | undefined> {
    const now = Date.now();
    const deployment = [...this.deployments.values()].find(
      (item) =>
        item.status === "queued" ||
        ((item.status === "building" || item.status === "deploying") &&
          (!item.leaseExpiresAt || Date.parse(item.leaseExpiresAt) <= now))
    );
    if (!deployment) return undefined;
    const claimed = {
      ...deployment,
      status: "building" as const,
      leaseExpiresAt,
      leaseToken: (deployment.leaseToken ?? 0) + 1,
      updatedAt: new Date().toISOString()
    };
    this.deployments.set(claimed.jobId, claimed);
    return claimed;
  }

  async updateDeployment(
    siteId: string,
    jobId: string,
    leaseToken: number,
    patch: Partial<
      Pick<Deployment, "artifactId" | "status" | "previewUrl" | "errorSummary" | "leaseExpiresAt">
    >
  ): Promise<Deployment | undefined> {
    const current = await this.getDeployment(siteId, jobId);
    if (
      !current ||
      current.leaseToken !== leaseToken ||
      !current.leaseExpiresAt ||
      Date.parse(current.leaseExpiresAt) <= Date.now()
    ) {
      return undefined;
    }
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.deployments.set(jobId, updated);
    return updated;
  }

  async getAuditLogs(siteId: string): Promise<AuditLog[]> {
    return this.audits.filter((audit) => audit.siteId === siteId);
  }

  async recordAudit(actorId: string, action: string, siteId: string, targetId: string): Promise<void> {
    this.audit(actorId, action, siteId, targetId);
  }

  private audit(actorId: string, action: string, siteId: string, targetId: string): void {
    this.audits.push({ actorId, action, siteId, targetId, createdAt: new Date().toISOString() });
  }
}
