import { SiteConfigSchema, type SiteConfig } from "@zhansite/site-config";

export function parseConfigJson(value: string): SiteConfig {
  return SiteConfigSchema.parse(JSON.parse(value));
}
