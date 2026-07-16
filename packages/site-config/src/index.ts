import { z } from "zod";
export { registerSiteConfigJsonSchemaKeywords } from "./json-schema-keywords.js";

const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/);
const assetIdSchema = z.string().regex(/^asset_[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/);
const shortTextSchema = z.string().trim().min(1).max(100);

const textListSchema = (maxItems: number) =>
  z.array(shortTextSchema).min(1).max(maxItems);
const uniqueList = <T extends z.ZodType>(schema: T, maxItems: number, message: string) =>
  z.array(schema).max(maxItems).refine((items) => new Set(items).size === items.length, message);

export const SiteConfigSchema = z.strictObject({
    brand: z.strictObject({
      name: shortTextSchema,
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      logoAssetId: assetIdSchema
    }),
    contact: z.strictObject({
      phone: z.string().trim().min(3).max(30),
      fax: z.string().trim().min(3).max(30).optional(),
      address: z.string().trim().min(1).max(200),
      wechatQrAssetId: assetIdSchema.optional(),
      mapUrl: z.url().max(2048).optional()
    }),
    assets: z.strictObject({
      certificates: z
        .array(
          z.strictObject({
            name: shortTextSchema,
            assetId: assetIdSchema,
            order: z.number().int().min(1)
          })
        )
        .max(30),
      pdfCatalogAssetId: assetIdSchema.optional()
    }),
    home: z.strictObject({
      hero: z.strictObject({
        title: shortTextSchema,
        summary: z.string().trim().min(1).max(300)
      }),
      principles: textListSchema(4),
      strengths: textListSchema(6),
      featuredCategoryIds: uniqueList(idSchema, 10, "精选分类 ID 不可重复")
    }),
    products: z.strictObject({
      categories: z
        .array(
          z.strictObject({
            id: idSchema,
            slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
            name: shortTextSchema,
            summary: z.string().trim().min(1).max(300),
            series: z
              .array(
                z.strictObject({
                  id: idSchema,
                  name: shortTextSchema,
                  sellingPoint: z.string().trim().min(1).max(300),
                  imageAssetId: assetIdSchema.optional()
                })
              )
              .min(1)
              .max(30)
          })
        )
        .min(1)
        .max(10)
    }),
    certifications: z.strictObject({
      groups: z
        .array(
          z.strictObject({
            name: shortTextSchema,
            items: z.array(
              z.strictObject({
                name: shortTextSchema,
                assetId: assetIdSchema
              })
            )
          })
        )
        .max(10)
    }),
    about: z.strictObject({
      introduction: z.string().trim().min(1).max(2000),
      principles: textListSchema(4),
      industries: z.array(shortTextSchema).max(12),
      factoryImageAssetIds: uniqueList(assetIdSchema, 10, "厂房图片 Asset ID 不可重复").optional()
    })
  })
  .superRefine((config, context) => {
    const categoryIds = config.products.categories.map((category) => category.id);
    const categorySlugs = config.products.categories.map((category) => category.slug);
    if (new Set(categoryIds).size !== categoryIds.length) {
      context.addIssue({ code: "custom", path: ["products", "categories"], message: "产品分类 ID 不可重复" });
    }
    if (new Set(categorySlugs).size !== categorySlugs.length) {
      context.addIssue({ code: "custom", path: ["products", "categories"], message: "产品分类 slug 不可重复" });
    }
    for (const [index, categoryId] of config.home.featuredCategoryIds.entries()) {
      if (!categoryIds.includes(categoryId)) {
        context.addIssue({
          code: "custom",
          path: ["home", "featuredCategoryIds", index],
          message: "精选分类必须引用现有产品分类"
        });
      }
    }
  });

export const CreateSiteSchema = z.strictObject({
  siteId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  name: shortTextSchema,
  template: z.literal("b2b-manufacturing-v1"),
  config: SiteConfigSchema
});

export const CreateRevisionSchema = z.strictObject({
  expectedRevision: z.number().int().min(0),
  config: SiteConfigSchema
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;
export type CreateRevisionInput = z.infer<typeof CreateRevisionSchema>;

export const siteConfigSchemaVersion = "1.0" as const;
