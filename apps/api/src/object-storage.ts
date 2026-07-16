import OSS from "ali-oss";

export type StoredObject = {
  contentType: string;
  sizeBytes: number;
  content: Buffer;
};

export interface ObjectStorage {
  createSignedPut(
    objectKey: string,
    contentType: string,
    expiresSeconds: number,
    localUploadToken: string
  ): Promise<{ url: string; method: "PUT"; headers: Record<string, string> }>;
  inspect(objectKey: string): Promise<Omit<StoredObject, "content"> | undefined>;
  read(objectKey: string): Promise<Buffer>;
  remove(objectKey: string): Promise<void>;
  promote(sourceKey: string, destinationKey: string, contentType: string): Promise<void>;
  write(objectKey: string, contentType: string, content: Buffer): Promise<void>;
  publicUrl(objectKey: string): string;
  putLocal?(objectKey: string, contentType: string, content: Buffer): Promise<void>;
}

export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, StoredObject>();

  async createSignedPut(
    _objectKey: string,
    contentType: string,
    _expiresSeconds: number,
    localUploadToken: string
  ) {
    return {
      url: `/local-uploads/${encodeURIComponent(localUploadToken)}`,
      method: "PUT" as const,
      headers: { "content-type": contentType }
    };
  }

  async inspect(objectKey: string) {
    const object = this.objects.get(objectKey);
    if (!object) return undefined;
    return { contentType: object.contentType, sizeBytes: object.sizeBytes };
  }

  async read(objectKey: string): Promise<Buffer> {
    const object = this.objects.get(objectKey);
    if (!object) throw new Error("object_not_found");
    return object.content;
  }

  async remove(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
  }

  async promote(sourceKey: string, destinationKey: string, contentType: string): Promise<void> {
    const source = this.objects.get(sourceKey);
    if (!source) throw new Error("object_not_found");
    this.objects.set(destinationKey, { ...source, contentType });
  }

  async write(objectKey: string, contentType: string, content: Buffer): Promise<void> {
    this.objects.set(objectKey, { contentType, sizeBytes: content.byteLength, content });
  }

  publicUrl(objectKey: string): string {
    return `/local-objects/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  }

  async putLocal(objectKey: string, contentType: string, content: Buffer): Promise<void> {
    this.objects.set(objectKey, { contentType, sizeBytes: content.byteLength, content });
  }
}

type AliOssOptions = {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  endpoint?: string;
  secure?: boolean;
  publicBaseUrl: string;
};

export class AliOssObjectStorage implements ObjectStorage {
  private readonly client: OSS;
  private readonly publicBaseUrl: string;

  constructor(options: AliOssOptions) {
    this.client = new OSS({
      region: options.region,
      bucket: options.bucket,
      accessKeyId: options.accessKeyId,
      accessKeySecret: options.accessKeySecret,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      secure: options.secure ?? true
    });
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/+$/, "");
  }

  async createSignedPut(objectKey: string, contentType: string, expiresSeconds: number) {
    return {
      url: this.client.signatureUrl(objectKey, {
        method: "PUT",
        expires: expiresSeconds,
        "Content-Type": contentType
      }),
      method: "PUT" as const,
      headers: { "content-type": contentType }
    };
  }

  async inspect(objectKey: string) {
    try {
      const result = await this.client.head(objectKey);
      const headers = result.res.headers as Record<string, string | undefined>;
      return {
        contentType: headers["content-type"] ?? "application/octet-stream",
        sizeBytes: Number(headers["content-length"] ?? 0)
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        (error as { status?: number }).status === 404
      ) {
        return undefined;
      }
      throw error;
    }
  }

  async read(objectKey: string): Promise<Buffer> {
    const result = await this.client.get(objectKey);
    return Buffer.isBuffer(result.content) ? result.content : Buffer.from(result.content);
  }

  async remove(objectKey: string): Promise<void> {
    await this.client.delete(objectKey);
  }

  async promote(sourceKey: string, destinationKey: string, _contentType: string): Promise<void> {
    await this.client.copy(destinationKey, sourceKey);
  }

  async write(objectKey: string, contentType: string, content: Buffer): Promise<void> {
    await this.client.put(objectKey, content, { headers: { "content-type": contentType } });
  }

  publicUrl(objectKey: string): string {
    return `${this.publicBaseUrl}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  }
}
