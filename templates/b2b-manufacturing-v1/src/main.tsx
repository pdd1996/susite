import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TemplateApp } from "./index.js";
import type { SiteConfig } from "@zhansite/site-config";

declare const __SITE_CONFIG__: SiteConfig;
declare const __ASSET_URLS__: Record<string, string>;

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <TemplateApp config={__SITE_CONFIG__} assetUrls={__ASSET_URLS__} />
  </BrowserRouter>
);
