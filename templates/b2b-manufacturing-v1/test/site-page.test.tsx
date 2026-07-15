import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteConfigSchema } from "@zhansite/site-config";
import { SitePage } from "../src/index.js";
import revisionFixture from "../fixtures/jinyuan.revision.json";

describe("b2b-manufacturing-v1", () => {
  it("keeps the build fixture compatible with SiteConfig v1", () => {
    expect(SiteConfigSchema.parse(revisionFixture.config)).toEqual(revisionFixture.config);
  });

  it("renders a SiteConfig into a phone-ready page", () => {
    const html = renderToStaticMarkup(
      <SitePage
        config={{
          brand: { name: "金源电器", primaryColor: "#C41E3A", logoAssetId: "asset_logo_01" },
          contact: { phone: "0571-86817925", address: "杭州" },
          assets: { certificates: [] },
          home: {
            hero: { title: "金源电器", summary: "专注互感器研发制造" },
            principles: ["质量"],
            strengths: ["国标生产"],
            featuredCategoryIds: ["lv-current"]
          },
          products: {
            categories: [{
              id: "lv-current",
              slug: "lv-current",
              name: "低压电流互感器",
              summary: "配电测量",
              series: [{ id: "lmk1", name: "LMK1", sellingPoint: "免拆线安装" }]
            }]
          },
          certifications: { groups: [] },
          about: { introduction: "介绍", principles: ["质量"], industries: ["电网"] }
        }}
      />
    );

    expect(html).toContain("金源电器");
    expect(html).toContain("tel:0571-86817925");
  });
});
