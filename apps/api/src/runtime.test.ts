import { describe, expect, it } from "vitest";
import { UnavailablePreviewPublisher } from "./deployment-service.js";
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
});
