import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { CreateRevisionSchema, CreateSiteSchema } from "@zhansite/site-config";
import { validateAssetReferences } from "./asset-validation.js";
import {
  DeploymentService,
  DeploymentValidationError,
  UnavailablePreviewPublisher
} from "./deployment-service.js";
import { InMemoryObjectStorage, type ObjectStorage } from "./object-storage.js";
import {
  SiteAlreadyExistsError,
  assetTypes,
  type AssetSourceKind,
  type AssetType,
  type SiteRepository
} from "./repository.js";
import { UploadService, UploadValidationError } from "./upload-service.js";

type AppOptions = {
  actorId: string;
  allowedOrigin?: string;
  objectStorage?: ObjectStorage;
  uploadService?: UploadService;
  deploymentService?: DeploymentService;
  uploadTokenSecret?: string;
};

export function createApp(repository: SiteRepository, options: AppOptions) {
  const app = new Hono();
  const objectStorage = options.objectStorage ?? new InMemoryObjectStorage();
  const uploadService =
    options.uploadService ??
    new UploadService(repository, objectStorage, options.uploadTokenSecret ?? "local-test-secret");
  const deploymentService =
    options.deploymentService ??
    new DeploymentService(repository, new UnavailablePreviewPublisher());
  app.use("*", cors({ origin: options.allowedOrigin ?? "http://localhost:5173" }));
  app.onError((error, context) => {
    if (error instanceof SyntaxError) return context.json({ error: "invalid_json" }, 400);
    console.error(error);
    return context.json({ error: "internal_error" }, 500);
  });

  app.get("/sites", async (context) => context.json(await repository.listSites()));

  app.post("/sites", async (context) => {
    const parsed = CreateSiteSchema.safeParse(await context.req.json());
    if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);

    try {
      const { config, ...siteInput } = parsed.data;
      if (await repository.getSite(siteInput.siteId)) {
        return context.json({ error: "site_already_exists" }, 409);
      }
      const assetValidation = await validateAssetReferences(
        repository,
        siteInput.siteId,
        config,
        "draft"
      );
      if (assetValidation.issues.length > 0) {
        return context.json(
          { error: "asset_validation_failed", issues: assetValidation.issues },
          400
        );
      }
      const created = await repository.createSite(siteInput, config, options.actorId);
      return context.json(created, 201);
    } catch (error) {
      if (error instanceof SiteAlreadyExistsError) {
        return context.json({ error: "site_already_exists" }, 409);
      }
      throw error;
    }
  });

  app.get("/sites/:siteId", async (context) => {
    const site = await repository.getSite(context.req.param("siteId"));
    return site ? context.json(site) : context.json({ error: "site_not_found" }, 404);
  });

  app.get("/sites/:siteId/revisions", async (context) => {
    const siteId = context.req.param("siteId");
    if (!(await repository.getSite(siteId))) return context.json({ error: "site_not_found" }, 404);
    return context.json(await repository.getRevisions(siteId));
  });

  app.post("/sites/:siteId/revisions", async (context) => {
    const parsed = CreateRevisionSchema.safeParse(await context.req.json());
    if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);

    const siteId = context.req.param("siteId");
    const assetValidation = await validateAssetReferences(
      repository,
      siteId,
      parsed.data.config,
      "draft"
    );
    if (assetValidation.issues.length > 0) {
      return context.json(
        { error: "asset_validation_failed", issues: assetValidation.issues },
        400
      );
    }

    const result = await repository.createRevision(
      siteId,
      parsed.data.expectedRevision,
      parsed.data.config,
      options.actorId
    );

    if (result.kind === "not_found") return context.json({ error: "site_not_found" }, 404);
    if (result.kind === "conflict") {
      return context.json({ error: "revision_conflict", currentRevision: result.currentRevision }, 409);
    }
    return context.json(result.revision, 201);
  });

  const signUploadSchema = z.strictObject({
    type: z.enum(assetTypes),
    contentType: z.string().min(1).max(100),
    sizeBytes: z.number().int().positive(),
    originalFilename: z.string().trim().min(1).max(255),
    sourceKind: z.enum(["customer_provided", "placeholder"])
  });
  app.post("/sites/:siteId/upload/sign", async (context) => {
    const siteId = context.req.param("siteId");
    if (!(await repository.getSite(siteId))) return context.json({ error: "site_not_found" }, 404);
    const parsed = signUploadSchema.safeParse(await context.req.json());
    if (!parsed.success) {
      return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }
    try {
      const sourceKind = parsed.data.sourceKind as AssetSourceKind;
      const type = parsed.data.type as AssetType;
      const signed = await uploadService.sign(siteId, {
        type,
        contentType: parsed.data.contentType,
        sizeBytes: parsed.data.sizeBytes,
        originalFilename: parsed.data.originalFilename,
        sourceKind,
        ...(sourceKind === "placeholder"
          ? {
              placeholderApprovedBy: options.actorId,
              placeholderApprovedAt: new Date().toISOString()
            }
          : {})
      });
      await repository.recordAudit(
        options.actorId,
        "asset.upload_signed",
        siteId,
        signed.objectKey
      );
      return context.json(signed, 201);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        return context.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  const completeUploadSchema = z.strictObject({
    uploadToken: z.string().min(1),
    checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional()
  });
  app.post("/sites/:siteId/assets/complete", async (context) => {
    const siteId = context.req.param("siteId");
    if (!(await repository.getSite(siteId))) return context.json({ error: "site_not_found" }, 404);
    const parsed = completeUploadSchema.safeParse(await context.req.json());
    if (!parsed.success) {
      return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }
    try {
      const asset = await uploadService.complete(
        siteId,
        parsed.data.uploadToken,
        options.actorId,
        parsed.data.checksumSha256
      );
      return context.json(asset, 201);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        return context.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/sites/:siteId/assets", async (context) => {
    const siteId = context.req.param("siteId");
    if (!(await repository.getSite(siteId))) return context.json({ error: "site_not_found" }, 404);
    return context.json(await repository.listAssets(siteId));
  });

  const createDeploymentSchema = z.strictObject({
    revision: z.number().int().positive(),
    idempotencyKey: z.string().trim().min(1).max(120)
  });
  app.post("/sites/:siteId/deployments", async (context) => {
    const parsed = createDeploymentSchema.safeParse(await context.req.json());
    if (!parsed.success) {
      return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }
    try {
      const result = await deploymentService.create(
        context.req.param("siteId"),
        parsed.data.revision,
        parsed.data.idempotencyKey,
        options.actorId
      );
      return context.json(result.deployment, result.created ? 202 : 200);
    } catch (error) {
      if (error instanceof DeploymentValidationError) {
        const status = error.code === "site_not_found" || error.code === "revision_not_found" ? 404 : 400;
        return context.json({ error: error.code, ...(error.issues ? { issues: error.issues } : {}) }, status);
      }
      throw error;
    }
  });

  app.get("/sites/:siteId/deployments/:jobId", async (context) => {
    const siteId = context.req.param("siteId");
    const deployment = await repository.getDeployment(
      siteId,
      context.req.param("jobId")
    );
    if (!deployment) {
      if (await repository.getSite(siteId)) {
        await repository.recordAudit(
          options.actorId,
          "security.scope_denied",
          siteId,
          "deployment"
        );
      }
      return context.json({ error: "deployment_not_found" }, 404);
    }
    const previewState = await repository.getPreviewState(siteId);
    return context.json({
      ...deployment,
      servingPreviousHealthyVersion:
        deployment.status !== "healthy" &&
        Boolean(previewState && previewState.activeDeploymentId !== deployment.deploymentId)
    });
  });

  app.get("/sites/:siteId/preview-state", async (context) => {
    const siteId = context.req.param("siteId");
    if (!(await repository.getSite(siteId))) return context.json({ error: "site_not_found" }, 404);
    const state = await repository.getPreviewState(siteId);
    if (!state) return context.json({ error: "preview_state_not_found" }, 404);
    const artifact = await repository.getArtifact(siteId, state.activeArtifactId);
    return context.json({ ...state, ...(artifact ? { revision: artifact.revision } : {}) });
  });

  app.get("/sites/:siteId/artifacts", async (context) => {
    const siteId = context.req.param("siteId");
    if (!(await repository.getSite(siteId))) return context.json({ error: "site_not_found" }, 404);
    return context.json(
      (await repository.listReadyArtifacts(siteId)).map(
        ({ artifactId, revision, templateVersion, createdAt }) => ({
          artifactId,
          revision,
          templateVersion,
          createdAt
        })
      )
    );
  });

  app.get("/sites/:siteId/deployments/:jobId/events", async (context) => {
    const siteId = context.req.param("siteId");
    const events = await repository.listDeploymentEvents(siteId, context.req.param("jobId"));
    if (!events) {
      if (await repository.getSite(siteId)) {
        await repository.recordAudit(options.actorId, "security.scope_denied", siteId, "deployment_events");
      }
      return context.json({ error: "deployment_not_found" }, 404);
    }
    return context.json(events);
  });

  const rollbackSchema = z.strictObject({
    artifactId: z.string().trim().min(1).max(110),
    idempotencyKey: z.string().trim().min(1).max(120)
  });
  app.post("/sites/:siteId/rollbacks", async (context) => {
    const siteId = context.req.param("siteId");
    const parsed = rollbackSchema.safeParse(await context.req.json());
    if (!parsed.success) {
      return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }
    try {
      const result = await deploymentService.createRollback(
        siteId,
        parsed.data.artifactId,
        parsed.data.idempotencyKey,
        options.actorId
      );
      return context.json(result.deployment, result.created ? 202 : 200);
    } catch (error) {
      if (error instanceof DeploymentValidationError) {
        if (await repository.getSite(siteId)) {
          await repository.recordAudit(options.actorId, "security.scope_denied", siteId, "rollback");
        }
        return context.json({ error: "artifact_not_found" }, 404);
      }
      throw error;
    }
  });

  app.put("/local-uploads/:token", async (context) => {
    try {
      const contentType = context.req.header("content-type") ?? "application/octet-stream";
      const content = Buffer.from(await context.req.arrayBuffer());
      await uploadService.acceptLocalUpload(context.req.param("token"), contentType, content);
      return context.body(null, 204);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        return context.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/local-objects/*", async (context) => {
    try {
      const objectKey = (context.req.param("*") ?? "").split("/").map(decodeURIComponent).join("/");
      const metadata = await objectStorage.inspect(objectKey);
      if (!metadata) return context.json({ error: "object_not_found" }, 404);
      return new Response(new Uint8Array(await objectStorage.read(objectKey)), {
        status: 200,
        headers: {
          "content-type": metadata.contentType,
          "content-length": String(metadata.sizeBytes)
        }
      });
    } catch {
      return context.json({ error: "object_not_found" }, 404);
    }
  });

  return app;
}
