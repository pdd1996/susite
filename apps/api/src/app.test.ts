import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { InMemorySiteRepository } from "./repository.js";
import { isDuplicateEntryError } from "./mysql-repository.js";

const config = {
  brand: { name: "杭州金源电器有限公司", primaryColor: "#C41E3A", logoAssetId: "asset_logo_01" },
  contact: { phone: "0571-86817925", address: "杭州市莫干山路1418号" },
  assets: { certificates: [] },
  home: {
    hero: { title: "杭州金源电器有限公司", summary: "专注互感器研发制造" },
    principles: ["以质量求生存"],
    strengths: ["国标生产"],
    featuredCategoryIds: ["lv-current"]
  },
  products: {
    categories: [{
      id: "lv-current",
      slug: "lv-current",
      name: "低压电流互感器",
      summary: "适用于低压配电",
      series: [{ id: "lmk1-bh", name: "LMK1(BH)-0.66", sellingPoint: "免拆线安装" }]
    }]
  },
  certifications: { groups: [] },
  about: { introduction: "专业生产互感器产品。", principles: ["以质量求生存"], industries: ["电网"] }
};

describe("Phase 1 site API", () => {
  it("recognizes MySQL duplicate-key errors for 409 mapping", () => {
    expect(isDuplicateEntryError({ code: "ER_DUP_ENTRY" })).toBe(true);
    expect(isDuplicateEntryError(new Error("other"))).toBe(false);
  });

  it("creates immutable revisions and rejects stale writes", async () => {
    const app = createApp(new InMemorySiteRepository(), { actorId: "trusted-operator" });
    const createSite = await app.request("/sites", {
      method: "POST",
      body: JSON.stringify({ siteId: "jinyuan-20260524", name: "杭州金源电器", template: "b2b-manufacturing-v1" })
    });
    expect(createSite.status).toBe(201);

    const createRevision = () =>
      app.request("/sites/jinyuan-20260524/revisions", {
        method: "POST",
        body: JSON.stringify({ expectedRevision: 0, config })
      });

    expect((await createRevision()).status).toBe(201);
    const staleWrite = await createRevision();
    expect(staleWrite.status).toBe(409);
    await expect(staleWrite.json()).resolves.toMatchObject({
      error: "revision_conflict",
      currentRevision: 1
    });

    const [revision] = await (
      await app.request("/sites/jinyuan-20260524/revisions")
    ).json();
    expect(revision.createdBy).toBe("trusted-operator");
  });

  it("returns stable client errors for malformed JSON and duplicate sites", async () => {
    const app = createApp(new InMemorySiteRepository(), { actorId: "trusted-operator" });
    const malformed = await app.request("/sites", { method: "POST", body: "{" });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: "invalid_json" });

    const body = JSON.stringify({
      siteId: "duplicate-site",
      name: "重复站点",
      template: "b2b-manufacturing-v1"
    });
    expect((await app.request("/sites", { method: "POST", body })).status).toBe(201);
    expect((await app.request("/sites", { method: "POST", body })).status).toBe(409);
  });
});
