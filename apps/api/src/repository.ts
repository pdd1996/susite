import { randomUUID } from "node:crypto";
import type { SiteConfig } from "@zhansite/site-config";

export const contentStatuses = ["draft", "review_requested", "approved", "archived"] as const;
export type ContentStatus = (typeof contentStatuses)[number];

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
  contentStatus: ContentStatus;
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

export type DeploymentStatus =
  | "queued"
  | "building"
  | "deploying"
  | "retry_waiting"
  | "healthy"
  | "failed";
export type DeploymentKind = "publish" | "rollback";
export type DeploymentErrorClass = "transient" | "permanent" | "concurrency";
export type Deployment = {
  deploymentId: string;
  jobId: string;
  siteId: string;
  revision: number;
  artifactId?: string;
  targetArtifactId?: string;
  kind?: DeploymentKind;
  environment: "preview";
  idempotencyKey: string;
  status: DeploymentStatus;
  placeholderAssetIds: string[];
  previewUrl?: string;
  errorSummary?: string;
  attemptCount?: number;
  maxAttempts?: number;
  nextAttemptAt?: string;
  lastErrorCode?: string;
  lastErrorClass?: DeploymentErrorClass;
  leaseExpiresAt?: string;
  leaseToken?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type SitePreviewState = {
  siteId: string;
  environment: "preview";
  activeArtifactId: string;
  activeDeploymentId: string;
  previewUrl: string;
  version: number;
  activatedAt: string;
  updatedAt: string;
};

export type DeploymentEvent = {
  eventId: string;
  deploymentId: string;
  siteId: string;
  attempt: number;
  sequence: number;
  stage: string;
  level: "info" | "warn" | "error";
  code: string;
  message: string;
  createdAt: string;
};

export type AuditLog = {
  actorId: string;
  action: string;
  siteId: string;
  targetId: string;
  createdAt: string;
};

export const reviewKinds = ["preview_sent", "customer_feedback", "customer_confirmed"] as const;
export type ReviewKind = (typeof reviewKinds)[number];
export const reviewChannels = ["wechat", "phone", "email", "in_person", "other"] as const;
export type ReviewChannel = (typeof reviewChannels)[number];
export type ReviewOutcome = "pending" | "changes_requested" | "approved";

export type ReviewRecord = {
  reviewId: string;
  siteId: string;
  revision: number;
  deploymentId: string;
  kind: ReviewKind;
  outcome: ReviewOutcome;
  channel: ReviewChannel;
  previewUrl: string;
  note: string;
  recordedBy: string;
  recordedAt: string;
};

export type ReviewMutationResult =
  | { kind: "created"; record: ReviewRecord; revision: SiteRevision }
  | { kind: "site_not_found" | "revision_not_found" | "deployment_not_found" }
  | { kind: "review_deployment_mismatch" }
  | { kind: "status_conflict"; currentStatus: ContentStatus }
  | { kind: "transition_invalid" };

export type RevisionStatusMutationResult =
  | { kind: "updated"; revision: SiteRevision }
  | { kind: "site_not_found" | "revision_not_found" | "current_revision" }
  | { kind: "status_conflict"; currentStatus: ContentStatus }
  | { kind: "transition_invalid" };

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
  archiveRevision(
    siteId: string,
    revision: number,
    expectedStatus: ContentStatus,
    actorId: string
  ): Promise<RevisionStatusMutationResult>;
  createReviewRecord(input: {
    siteId: string;
    revision: number;
    deploymentId: string;
    kind: ReviewKind;
    channel: ReviewChannel;
    note: string;
    expectedStatus: ContentStatus;
    actorId: string;
  }): Promise<ReviewMutationResult>;
  listReviewRecords(siteId: string, revision?: number): Promise<ReviewRecord[]>;
  createAsset(asset: Asset): Promise<Asset>;
  listAssets(siteId: string): Promise<Asset[]>;
  getAssetsByIds(assetIds: string[]): Promise<Asset[]>;
  claimArtifact(
    artifact: BuildArtifact,
    leaseExpiresAt: string
  ): Promise<{ artifact: BuildArtifact; claimed: boolean }>;
  markArtifactReady(artifactId: string, leaseToken: number): Promise<BuildArtifact | undefined>;
  getArtifact(siteId: string, artifactId: string): Promise<BuildArtifact | undefined>;
  listReadyArtifacts(siteId: string): Promise<BuildArtifact[]>;
  createDeployment(deployment: Deployment): Promise<{ deployment: Deployment; created: boolean }>;
  getDeployment(siteId: string, jobId: string): Promise<Deployment | undefined>;
  failExpiredDeployments(now: string): Promise<Deployment[]>;
  claimNextDeployment(leaseExpiresAt: string): Promise<Deployment | undefined>;
  updateDeployment(
    siteId: string,
    jobId: string,
    leaseToken: number,
    patch: Partial<
      Pick<
        Deployment,
        | "artifactId"
        | "status"
        | "previewUrl"
        | "errorSummary"
        | "leaseExpiresAt"
        | "nextAttemptAt"
        | "lastErrorCode"
        | "lastErrorClass"
      >
    >
  ): Promise<Deployment | undefined>;
  getPreviewState(siteId: string): Promise<SitePreviewState | undefined>;
  activatePreview(input: {
    siteId: string;
    deploymentId: string;
    artifactId: string;
    leaseToken: number;
    expectedVersion: number;
    previewUrl: string;
    activatedAt: string;
  }): Promise<"activated" | "already_activated" | "activation_conflict" | "lease_lost">;
  appendDeploymentEvent(
    event: Omit<DeploymentEvent, "eventId" | "sequence" | "createdAt">
  ): Promise<DeploymentEvent>;
  listDeploymentEvents(siteId: string, jobId: string): Promise<DeploymentEvent[] | undefined>;
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
  private readonly previewStates = new Map<string, SitePreviewState>();
  private readonly deploymentEvents = new Map<string, DeploymentEvent[]>();
  private readonly reviews: ReviewRecord[] = [];
  private readonly audits: AuditLog[] = [];

  constructor(private readonly now: () => number = Date.now) {}

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
      contentStatus: "draft",
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
      contentStatus: "draft",
      createdBy: actorId,
      createdAt: new Date().toISOString()
    };

    site.currentRevision = revision.revision;
    this.revisions.get(siteId)?.push(revision);
    this.audit(actorId, "revision.created", siteId, `${siteId}:${revision.revision}`);
    return { kind: "created", revision };
  }

  async archiveRevision(
    siteId: string,
    revisionNumber: number,
    expectedStatus: ContentStatus,
    actorId: string
  ): Promise<RevisionStatusMutationResult> {
    const site = this.sites.get(siteId);
    if (!site) return { kind: "site_not_found" };
    const revision = this.revisions.get(siteId)?.find((item) => item.revision === revisionNumber);
    if (!revision) return { kind: "revision_not_found" };
    if (revisionNumber === site.currentRevision) return { kind: "current_revision" };
    if (revision.contentStatus !== expectedStatus) {
      return { kind: "status_conflict", currentStatus: revision.contentStatus };
    }
    if (revision.contentStatus === "archived") return { kind: "transition_invalid" };
    revision.contentStatus = "archived";
    this.audit(actorId, "revision.archived", siteId, `${siteId}:${revisionNumber}`);
    return { kind: "updated", revision: { ...revision } };
  }

  async createReviewRecord(input: {
    siteId: string;
    revision: number;
    deploymentId: string;
    kind: ReviewKind;
    channel: ReviewChannel;
    note: string;
    expectedStatus: ContentStatus;
    actorId: string;
  }): Promise<ReviewMutationResult> {
    const site = this.sites.get(input.siteId);
    if (!site) return { kind: "site_not_found" };
    const revision = this.revisions
      .get(input.siteId)
      ?.find((item) => item.revision === input.revision);
    if (!revision) return { kind: "revision_not_found" };
    const deployment = [...this.deployments.values()].find(
      (item) =>
        item.deploymentId === input.deploymentId &&
        item.siteId === input.siteId &&
        item.revision === input.revision &&
        item.status === "healthy" &&
        Boolean(item.previewUrl)
    );
    if (!deployment) return { kind: "deployment_not_found" };
    if (revision.contentStatus !== input.expectedStatus) {
      return { kind: "status_conflict", currentStatus: revision.contentStatus };
    }
    const transitions: Record<ReviewKind, { from: ContentStatus; to: ContentStatus; outcome: ReviewOutcome }> = {
      preview_sent: { from: "draft", to: "review_requested", outcome: "pending" },
      customer_feedback: { from: "review_requested", to: "draft", outcome: "changes_requested" },
      customer_confirmed: { from: "review_requested", to: "approved", outcome: "approved" }
    };
    const transition = transitions[input.kind];
    if (revision.contentStatus !== transition.from) return { kind: "transition_invalid" };
    if (input.kind !== "preview_sent") {
      const sent = [...this.reviews]
        .reverse()
        .find(
          (record) =>
            record.siteId === input.siteId &&
            record.revision === input.revision &&
            record.kind === "preview_sent"
        );
      if (!sent || sent.deploymentId !== input.deploymentId) {
        return { kind: "review_deployment_mismatch" };
      }
    }

    const recordedAt = new Date(this.now()).toISOString();
    const record: ReviewRecord = {
      reviewId: `review_${randomUUID()}`,
      siteId: input.siteId,
      revision: input.revision,
      deploymentId: input.deploymentId,
      kind: input.kind,
      outcome: transition.outcome,
      channel: input.channel,
      previewUrl: deployment.previewUrl!,
      note: input.note,
      recordedBy: input.actorId,
      recordedAt
    };
    revision.contentStatus = transition.to;
    this.reviews.push(record);
    this.audit(input.actorId, "review.created", input.siteId, record.reviewId);
    this.audit(
      input.actorId,
      `revision.status.${transition.to}`,
      input.siteId,
      `${input.siteId}:${input.revision}`
    );
    return { kind: "created", record, revision: { ...revision } };
  }

  async listReviewRecords(siteId: string, revision?: number): Promise<ReviewRecord[]> {
    return this.reviews
      .filter((record) => record.siteId === siteId && (revision === undefined || record.revision === revision))
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
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
    if (existing?.leaseExpiresAt && Date.parse(existing.leaseExpiresAt) > this.now()) {
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
      Date.parse(artifact.leaseExpiresAt) <= this.now()
    ) {
      return undefined;
    }
    const ready = { ...artifact, status: "ready" as const, leaseExpiresAt: undefined };
    this.artifacts.set(artifactId, ready);
    return ready;
  }

  async getArtifact(siteId: string, artifactId: string): Promise<BuildArtifact | undefined> {
    const artifact = this.artifacts.get(artifactId);
    return artifact?.siteId === siteId ? artifact : undefined;
  }

  async listReadyArtifacts(siteId: string): Promise<BuildArtifact[]> {
    return [...this.artifacts.values()]
      .filter((artifact) => artifact.siteId === siteId && artifact.status === "ready")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async createDeployment(deployment: Deployment): Promise<{ deployment: Deployment; created: boolean }> {
    const existing = [...this.deployments.values()].find(
      (item) =>
        item.siteId === deployment.siteId &&
        item.kind === deployment.kind &&
        item.idempotencyKey === deployment.idempotencyKey
    );
    if (existing) return { deployment: existing, created: false };
    const normalized = {
      ...deployment,
      kind: deployment.kind ?? "publish",
      attemptCount: deployment.attemptCount ?? 0,
      maxAttempts: deployment.maxAttempts ?? 3
    };
    this.deployments.set(deployment.jobId, normalized);
    this.audit(deployment.createdBy, "deployment.created", deployment.siteId, deployment.deploymentId);
    return { deployment: normalized, created: true };
  }

  async getDeployment(siteId: string, jobId: string): Promise<Deployment | undefined> {
    const deployment = this.deployments.get(jobId);
    return deployment?.siteId === siteId ? deployment : undefined;
  }

  async failExpiredDeployments(now: string): Promise<Deployment[]> {
    const nowMs = Date.parse(now);
    const failed: Deployment[] = [];
    for (const deployment of this.deployments.values()) {
      if (
        !["building", "deploying"].includes(deployment.status) ||
        !deployment.leaseExpiresAt ||
        Date.parse(deployment.leaseExpiresAt) > nowMs ||
        (deployment.attemptCount ?? 0) < (deployment.maxAttempts ?? 3)
      ) continue;
      const updated: Deployment = {
        ...deployment,
        status: "failed",
        leaseExpiresAt: undefined,
        errorSummary: "已达到最大重试次数",
        lastErrorCode: "attempts_exhausted",
        lastErrorClass: "transient",
        updatedAt: new Date(this.now()).toISOString()
      };
      this.deployments.set(updated.jobId, updated);
      failed.push(updated);
    }
    return failed;
  }

  async claimNextDeployment(leaseExpiresAt: string): Promise<Deployment | undefined> {
    const now = this.now();
    const deployment = [...this.deployments.values()].find(
      (item) =>
        item.status === "queued" ||
        (item.status === "retry_waiting" &&
          (!item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now) &&
          (item.attemptCount ?? 0) < (item.maxAttempts ?? 3)) ||
        ((item.status === "building" || item.status === "deploying") &&
          (!item.leaseExpiresAt || Date.parse(item.leaseExpiresAt) <= now) &&
          (item.attemptCount ?? 0) < (item.maxAttempts ?? 3))
    );
    if (!deployment) return undefined;
    const claimed = {
      ...deployment,
      status: "building" as const,
      leaseExpiresAt,
      leaseToken: (deployment.leaseToken ?? 0) + 1,
      attemptCount: (deployment.attemptCount ?? 0) + 1,
      nextAttemptAt: undefined,
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
      Pick<
        Deployment,
        | "artifactId"
        | "status"
        | "previewUrl"
        | "errorSummary"
        | "leaseExpiresAt"
        | "nextAttemptAt"
        | "lastErrorCode"
        | "lastErrorClass"
      >
    >
  ): Promise<Deployment | undefined> {
    const current = await this.getDeployment(siteId, jobId);
    if (
      !current ||
      current.leaseToken !== leaseToken ||
      !current.leaseExpiresAt ||
      Date.parse(current.leaseExpiresAt) <= this.now()
    ) {
      return undefined;
    }
    const updated = {
      ...current,
      ...patch,
      ...(["healthy", "failed", "retry_waiting"].includes(patch.status ?? "")
        ? { leaseExpiresAt: undefined }
        : {}),
      updatedAt: new Date().toISOString()
    };
    this.deployments.set(jobId, updated);
    return updated;
  }

  async getPreviewState(siteId: string): Promise<SitePreviewState | undefined> {
    return this.previewStates.get(siteId);
  }

  async activatePreview(input: {
    siteId: string;
    deploymentId: string;
    artifactId: string;
    leaseToken: number;
    expectedVersion: number;
    previewUrl: string;
    activatedAt: string;
  }): Promise<"activated" | "already_activated" | "activation_conflict" | "lease_lost"> {
    const deployment = [...this.deployments.values()].find(
      (item) => item.deploymentId === input.deploymentId && item.siteId === input.siteId
    );
    const artifact = this.artifacts.get(input.artifactId);
    if (
      !deployment ||
      deployment.leaseToken !== input.leaseToken ||
      !deployment.leaseExpiresAt ||
      Date.parse(deployment.leaseExpiresAt) <= this.now()
    ) return "lease_lost";
    if (!artifact || artifact.siteId !== input.siteId || artifact.status !== "ready") {
      return "activation_conflict";
    }
    const current = this.previewStates.get(input.siteId);
    if (
      current?.activeDeploymentId === input.deploymentId &&
      current.activeArtifactId === input.artifactId
    ) return "already_activated";
    if ((current?.version ?? 0) !== input.expectedVersion) return "activation_conflict";
    this.previewStates.set(input.siteId, {
      siteId: input.siteId,
      environment: "preview",
      activeArtifactId: input.artifactId,
      activeDeploymentId: input.deploymentId,
      previewUrl: input.previewUrl,
      version: input.expectedVersion + 1,
      activatedAt: input.activatedAt,
      updatedAt: input.activatedAt
    });
    return "activated";
  }

  async appendDeploymentEvent(
    event: Omit<DeploymentEvent, "eventId" | "sequence" | "createdAt">
  ): Promise<DeploymentEvent> {
    const events = this.deploymentEvents.get(event.deploymentId) ?? [];
    const created: DeploymentEvent = {
      ...event,
      eventId: `${event.deploymentId}:${event.attempt}:${events.length + 1}`,
      sequence: events.filter((item) => item.attempt === event.attempt).length + 1,
      createdAt: new Date().toISOString()
    };
    events.push(created);
    this.deploymentEvents.set(event.deploymentId, events);
    return created;
  }

  async listDeploymentEvents(siteId: string, jobId: string): Promise<DeploymentEvent[] | undefined> {
    const deployment = await this.getDeployment(siteId, jobId);
    if (!deployment) return undefined;
    return [...(this.deploymentEvents.get(deployment.deploymentId) ?? [])].sort(
      (left, right) => left.attempt - right.attempt || left.sequence - right.sequence
    );
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
