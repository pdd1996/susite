import {
  TemplatePreviewPublisher,
  UnavailablePreviewPublisher,
  type PreviewPublisher
} from "./deployment-service.js";
import { createMySqlRepository } from "./mysql-repository.js";
import {
  AliOssObjectStorage,
  InMemoryObjectStorage,
  type ObjectStorage
} from "./object-storage.js";
import { InMemorySiteRepository, type SiteRepository } from "./repository.js";

export type RuntimeInfrastructure = {
  repository: SiteRepository;
  objectStorage: ObjectStorage;
  publisher: PreviewPublisher;
  hasOssConfig: boolean;
};

export function createRuntimeInfrastructure(
  env: NodeJS.ProcessEnv = process.env
): RuntimeInfrastructure {
  const repository = env.DATABASE_URL
    ? createMySqlRepository(env.DATABASE_URL)
    : new InMemorySiteRepository();
  const ossConfigValues = [
    env.OSS_REGION,
    env.OSS_BUCKET,
    env.OSS_ACCESS_KEY_ID,
    env.OSS_ACCESS_KEY_SECRET,
    env.OSS_PUBLIC_BASE_URL
  ];
  const hasAnyOssConfig = ossConfigValues.some(Boolean);
  const hasOssConfig = ossConfigValues.every(Boolean);
  if (hasAnyOssConfig && !hasOssConfig) {
    throw new Error("OSS configuration is incomplete; configure every required OSS_* variable.");
  }

  const objectStorage = hasOssConfig
    ? new AliOssObjectStorage({
        region: env.OSS_REGION!,
        bucket: env.OSS_BUCKET!,
        accessKeyId: env.OSS_ACCESS_KEY_ID!,
        accessKeySecret: env.OSS_ACCESS_KEY_SECRET!,
        publicBaseUrl: env.OSS_PUBLIC_BASE_URL!,
        ...(env.OSS_ENDPOINT ? { endpoint: env.OSS_ENDPOINT } : {})
      })
    : new InMemoryObjectStorage();
  const publisher =
    hasOssConfig && env.PLATFORM_DOMAIN && env.PREVIEW_RELEASE_HEALTH_BASE_URL
      ? new TemplatePreviewPublisher(
          objectStorage,
          env.PLATFORM_DOMAIN,
          env.PREVIEW_RELEASE_HEALTH_BASE_URL
        )
      : new UnavailablePreviewPublisher();

  return { repository, objectStorage, publisher, hasOssConfig };
}
