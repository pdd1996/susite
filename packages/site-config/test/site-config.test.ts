import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { registerSiteConfigJsonSchemaKeywords, SiteConfigSchema } from "../src/index.js";

const validConfig = {
  brand: {
    name: "杭州金源电器有限公司",
    primaryColor: "#C41E3A",
    logoAssetId: "asset_logo_01"
  },
  contact: {
    phone: "0571-86817925",
    address: "杭州市莫干山路1418号"
  },
  assets: { certificates: [] },
  home: {
    hero: { title: "杭州金源电器有限公司", summary: "专注互感器研发制造" },
    principles: ["以质量求生存"],
    strengths: ["国标生产"],
    featuredCategoryIds: ["lv-current"]
  },
  products: {
    categories: [
      {
        id: "lv-current",
        slug: "lv-current",
        name: "低压电流互感器",
        summary: "适用于低压配电",
        series: [{ id: "lmk1-bh", name: "LMK1(BH)-0.66", sellingPoint: "免拆线安装" }]
      }
    ]
  },
  certifications: { groups: [] },
  about: {
    introduction: "专业生产互感器产品。",
    principles: ["以质量求生存"],
    industries: ["电网"]
  }
};

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
registerSiteConfigJsonSchemaKeywords(ajv);
const validateJsonSchema = ajv.compile(
  JSON.parse(
    readFileSync(resolve(process.cwd(), "../../docs/schemas/site-config-v1.schema.json"), "utf8")
  )
);

describe("SiteConfigSchema", () => {
  it("accepts the Phase 1 Jinyuan configuration", () => {
    expect(SiteConfigSchema.parse(validConfig)).toEqual(validConfig);
    expect(validateJsonSchema(validConfig)).toBe(true);
  });

  it("rejects an invalid asset reference", () => {
    expect(() =>
      SiteConfigSchema.parse({
        ...validConfig,
        brand: { ...validConfig.brand, logoAssetId: "logo_01" }
      })
    ).toThrow();
  });

  it("rejects unknown nested fields instead of silently stripping them", () => {
    const invalid = {
      ...validConfig,
      brand: { ...validConfig.brand, unsupportedField: true }
    };
    expect(() => SiteConfigSchema.parse(invalid)).toThrow();
    expect(validateJsonSchema(invalid)).toBe(false);
  });

  it("rejects duplicate and missing featured category references", () => {
    const duplicate = {
      ...validConfig,
      home: { ...validConfig.home, featuredCategoryIds: ["lv-current", "lv-current"] }
    };
    const missing = {
      ...validConfig,
      home: { ...validConfig.home, featuredCategoryIds: ["missing-category"] }
    };

    expect(() => SiteConfigSchema.parse(duplicate)).toThrow();
    expect(validateJsonSchema(duplicate)).toBe(false);
    expect(() => SiteConfigSchema.parse(missing)).toThrow();
    expect(validateJsonSchema(missing)).toBe(false);
  });

  it("rejects duplicate category identities in both validators", () => {
    const duplicateId = {
      ...validConfig,
      products: {
        categories: [
          validConfig.products.categories[0],
          { ...validConfig.products.categories[0], slug: "another-category" }
        ]
      }
    };
    const duplicateSlug = {
      ...validConfig,
      products: {
        categories: [
          validConfig.products.categories[0],
          { ...validConfig.products.categories[0], id: "another-category" }
        ]
      }
    };

    expect(() => SiteConfigSchema.parse(duplicateId)).toThrow();
    expect(validateJsonSchema(duplicateId)).toBe(false);
    expect(() => SiteConfigSchema.parse(duplicateSlug)).toThrow();
    expect(validateJsonSchema(duplicateSlug)).toBe(false);
  });

  it("rejects whitespace-only required text in both validators", () => {
    const whitespaceOnly = {
      ...validConfig,
      brand: { ...validConfig.brand, name: "   " }
    };

    expect(() => SiteConfigSchema.parse(whitespaceOnly)).toThrow();
    expect(validateJsonSchema(whitespaceOnly)).toBe(false);
  });
});
