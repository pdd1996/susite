import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { Asset, AssetSourceKind, AssetType, SiteRepository } from "./repository.js";
import type { ObjectStorage } from "./object-storage.js";

const uploadRules: Record<AssetType, { contentTypes: string[]; maxBytes: number }> = {
  logo: { contentTypes: ["image/png", "image/webp", "image/svg+xml"], maxBytes: 2 * 1024 * 1024 },
  product_image: { contentTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 5 * 1024 * 1024 },
  certificate_image: {
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024
  },
  product_pdf: { contentTypes: ["application/pdf"], maxBytes: 50 * 1024 * 1024 },
  wechat_qr: { contentTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 2 * 1024 * 1024 },
  factory_image: { contentTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 5 * 1024 * 1024 }
};

type UploadClaims = {
  uploadId: string;
  siteId: string;
  objectKey: string;
  type: AssetType;
  contentType: string;
  sizeBytes: number;
  originalFilename: string;
  sourceKind: AssetSourceKind;
  placeholderApprovedBy?: string;
  placeholderApprovedAt?: string;
  expiresAt: number;
};

export type SignUploadInput = Omit<
  UploadClaims,
  "uploadId" | "siteId" | "objectKey" | "expiresAt"
>;

export class UploadValidationError extends Error {
  constructor(
    readonly code:
      | "upload_token_invalid"
      | "upload_expired"
      | "upload_type_not_allowed"
      | "upload_too_large"
      | "upload_object_missing"
      | "upload_metadata_mismatch"
      | "upload_content_invalid"
      | "upload_checksum_mismatch"
  ) {
    super(code);
    this.name = "UploadValidationError";
  }
}

export class UploadService {
  constructor(
    private readonly repository: SiteRepository,
    private readonly storage: ObjectStorage,
    private readonly tokenSecret: string,
    private readonly expiresSeconds = 600
  ) {}

  async sign(siteId: string, input: SignUploadInput) {
    const rule = uploadRules[input.type];
    if (!rule.contentTypes.includes(input.contentType)) {
      throw new UploadValidationError("upload_type_not_allowed");
    }
    if (input.sizeBytes <= 0 || input.sizeBytes > rule.maxBytes) {
      throw new UploadValidationError("upload_too_large");
    }
    const uploadId = randomUUID();
    const extension = extensionFor(input.contentType);
    const claims: UploadClaims = {
      ...input,
      uploadId,
      siteId,
      objectKey: `uploads/${siteId}/${uploadId}/source.${extension}`,
      expiresAt: Date.now() + this.expiresSeconds * 1000
    };
    const uploadToken = this.encodeClaims(claims);
    const signed = await this.storage.createSignedPut(
      claims.objectKey,
      claims.contentType,
      this.expiresSeconds,
      uploadToken
    );
    return {
      uploadToken,
      objectKey: claims.objectKey,
      expiresAt: new Date(claims.expiresAt).toISOString(),
      ...signed
    };
  }

  async acceptLocalUpload(token: string, contentType: string, content: Buffer): Promise<void> {
    if (!this.storage.putLocal) throw new UploadValidationError("upload_token_invalid");
    const claims = this.decodeClaims(token);
    if (claims.contentType !== contentType || claims.sizeBytes !== content.byteLength) {
      throw new UploadValidationError("upload_metadata_mismatch");
    }
    await this.storage.putLocal(claims.objectKey, contentType, content);
  }

  async complete(
    siteId: string,
    uploadToken: string,
    actorId: string,
    expectedChecksumSha256?: string
  ): Promise<Asset> {
    const claims = this.decodeClaims(uploadToken);
    if (claims.siteId !== siteId) throw new UploadValidationError("upload_token_invalid");
    const assetId = `asset_${claims.uploadId.replaceAll("-", "")}`;
    const [existingAsset] = await this.repository.getAssetsByIds([assetId]);
    if (existingAsset) {
      await this.storage.remove(claims.objectKey);
      return existingAsset;
    }

    try {
      const metadata = await this.storage.inspect(claims.objectKey);
      if (!metadata) throw new UploadValidationError("upload_object_missing");
      if (metadata.contentType !== claims.contentType || metadata.sizeBytes !== claims.sizeBytes) {
        throw new UploadValidationError("upload_metadata_mismatch");
      }

      const content = await this.storage.read(claims.objectKey);
      if (
        content.byteLength !== claims.sizeBytes ||
        !(await isValidFileContent(claims.contentType, content))
      ) {
        throw new UploadValidationError("upload_content_invalid");
      }
      const checksumSha256 = createHash("sha256").update(content).digest("hex");
      if (expectedChecksumSha256 && expectedChecksumSha256.toLowerCase() !== checksumSha256) {
        throw new UploadValidationError("upload_checksum_mismatch");
      }

      const destinationKey =
        `assets/${siteId}/${assetId}/${checksumSha256}.${extensionFor(claims.contentType)}`;
      await this.storage.promote(claims.objectKey, destinationKey, claims.contentType);
      const now = new Date().toISOString();
      return await this.repository.createAsset({
        assetId,
        siteId,
        type: claims.type,
        status: "verified",
        sourceKind: claims.sourceKind,
        ...(claims.placeholderApprovedBy
          ? { placeholderApprovedBy: claims.placeholderApprovedBy }
          : {}),
        ...(claims.placeholderApprovedAt
          ? { placeholderApprovedAt: claims.placeholderApprovedAt }
          : {}),
        objectKey: destinationKey,
        url: this.storage.publicUrl(destinationKey),
        contentType: claims.contentType,
        sizeBytes: claims.sizeBytes,
        checksumSha256,
        originalFilename: claims.originalFilename,
        createdBy: actorId,
        verifiedBy: actorId,
        createdAt: now,
        verifiedAt: now
      });
    } finally {
      await this.storage.remove(claims.objectKey);
    }
  }

  private encodeClaims(claims: UploadClaims): string {
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const signature = createHmac("sha256", this.tokenSecret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  private decodeClaims(token: string): UploadClaims {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) throw new UploadValidationError("upload_token_invalid");
    const expected = createHmac("sha256", this.tokenSecret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
      throw new UploadValidationError("upload_token_invalid");
    }
    let claims: UploadClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UploadClaims;
    } catch {
      throw new UploadValidationError("upload_token_invalid");
    }
    if (claims.expiresAt < Date.now()) throw new UploadValidationError("upload_expired");
    return claims;
  }
}

function extensionFor(contentType: string): string {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf"
  }[contentType] ?? "bin";
}

async function isValidFileContent(contentType: string, content: Buffer): Promise<boolean> {
  if (contentType === "image/jpeg") {
    return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  }
  if (contentType === "image/png") {
    return content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === "image/webp") {
    return (
      content.subarray(0, 4).toString("ascii") === "RIFF" &&
      content.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if (contentType === "application/pdf") {
    if (content.subarray(0, 5).toString("ascii") !== "%PDF-") return false;
    try {
      const document = await PDFDocument.load(content);
      return document.getPageCount() > 0;
    } catch {
      return false;
    }
  }
  if (contentType === "image/svg+xml") {
    const source = content.toString("utf8").trim();
    return (
      /^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(source) &&
      !/<script|<foreignObject|\son\w+\s*=|(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|javascript:)/i.test(
        source
      )
    );
  }
  return false;
}
