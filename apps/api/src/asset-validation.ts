import type { SiteConfig } from "@zhansite/site-config";
import type { Asset, AssetType, SiteRepository } from "./repository.js";

export type AssetReference = {
  assetId: string;
  path: string;
  expectedType: AssetType;
};

export type AssetValidationIssue = {
  assetId: string;
  path: string;
  code:
    | "asset_not_found"
    | "asset_wrong_site"
    | "asset_type_mismatch"
    | "asset_not_verified"
    | "placeholder_not_approved";
};

export function collectAssetReferences(config: SiteConfig): AssetReference[] {
  const references: AssetReference[] = [
    { assetId: config.brand.logoAssetId, path: "brand.logoAssetId", expectedType: "logo" }
  ];

  if (config.contact.wechatQrAssetId) {
    references.push({
      assetId: config.contact.wechatQrAssetId,
      path: "contact.wechatQrAssetId",
      expectedType: "wechat_qr"
    });
  }
  if (config.assets.pdfCatalogAssetId) {
    references.push({
      assetId: config.assets.pdfCatalogAssetId,
      path: "assets.pdfCatalogAssetId",
      expectedType: "product_pdf"
    });
  }

  config.assets.certificates.forEach((certificate, index) => {
    references.push({
      assetId: certificate.assetId,
      path: `assets.certificates.${index}.assetId`,
      expectedType: "certificate_image"
    });
  });
  config.certifications.groups.forEach((group, groupIndex) => {
    group.items.forEach((item, itemIndex) => {
      references.push({
        assetId: item.assetId,
        path: `certifications.groups.${groupIndex}.items.${itemIndex}.assetId`,
        expectedType: "certificate_image"
      });
    });
  });
  config.products.categories.forEach((category, categoryIndex) => {
    category.series.forEach((series, seriesIndex) => {
      if (!series.imageAssetId) return;
      references.push({
        assetId: series.imageAssetId,
        path: `products.categories.${categoryIndex}.series.${seriesIndex}.imageAssetId`,
        expectedType: "product_image"
      });
    });
  });
  config.about.factoryImageAssetIds?.forEach((assetId, index) => {
    references.push({
      assetId,
      path: `about.factoryImageAssetIds.${index}`,
      expectedType: "factory_image"
    });
  });

  return references;
}

export async function validateAssetReferences(
  repository: SiteRepository,
  siteId: string,
  config: SiteConfig,
  mode: "draft" | "deployment"
): Promise<{ issues: AssetValidationIssue[]; assets: Asset[] }> {
  const references = collectAssetReferences(config);
  const assets = await repository.getAssetsByIds([...new Set(references.map(({ assetId }) => assetId))]);
  const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
  const issues: AssetValidationIssue[] = [];

  for (const reference of references) {
    const asset = byId.get(reference.assetId);
    if (!asset) {
      if (mode === "deployment") {
        issues.push({ ...reference, code: "asset_not_found" });
      }
      continue;
    }
    if (asset.siteId !== siteId) {
      issues.push({ ...reference, code: "asset_wrong_site" });
      continue;
    }
    if (asset.type !== reference.expectedType) {
      issues.push({ ...reference, code: "asset_type_mismatch" });
      continue;
    }
    if (mode === "deployment" && asset.status !== "verified") {
      issues.push({ ...reference, code: "asset_not_verified" });
      continue;
    }
    if (
      mode === "deployment" &&
      asset.sourceKind === "placeholder" &&
      (!asset.placeholderApprovedBy || !asset.placeholderApprovedAt)
    ) {
      issues.push({ ...reference, code: "placeholder_not_approved" });
    }
  }

  return { issues, assets };
}
