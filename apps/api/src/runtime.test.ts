import { describe, expect, it } from "vitest";
import { TemplatePreviewPublisher, UnavailablePreviewPublisher } from "./deployment-service.js";
import { InMemoryObjectStorage } from "./object-storage.js";
import { InMemorySiteRepository } from "./repository.js";
import { createRuntimeInfrastructure } from "./runtime.js";

describe("runtime infrastructure", () => {
  it("uses controlled in-memory adapters when cloud configuration is absent", () => {
    const runtime = createRuntimeInfrastructure({});

    expect(runtime.hasOssConfig).toBe(false);
    expect(runtime.repository).toBeInstanceOf(InMemorySiteRepository);
    expect(runtime.objectStorage).toBeInstanceOf(InMemoryObjectStorage);
    expect(runtime.publisher).toBeInstanceOf(UnavailablePreviewPublisher);
  });

  it("rejects partial OSS configuration", () => {
    expect(() => createRuntimeInfrastructure({ OSS_REGION: "oss-cn-hangzhou" })).toThrow(
      "OSS configuration is incomplete"
    );
  });

  it("requires a candidate release health route before enabling real publishing", () => {
    const cloudEnvironment = {
      OSS_REGION: "oss-cn-hangzhou",
      OSS_BUCKET: "preview-bucket",
      OSS_ACCESS_KEY_ID: "key",
      OSS_ACCESS_KEY_SECRET: "secret",
      OSS_PUBLIC_BASE_URL: "https://assets.example.test",
      PLATFORM_DOMAIN: "example.test"
    };
    expect(createRuntimeInfrastructure(cloudEnvironment).publisher).toBeInstanceOf(
      UnavailablePreviewPublisher
    );
    expect(
      createRuntimeInfrastructure({
        ...cloudEnvironment,
        PREVIEW_RELEASE_HEALTH_BASE_URL: "https://candidate.example.test"
      }).publisher
    ).toBeInstanceOf(TemplatePreviewPublisher);
  });
});
