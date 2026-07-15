import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { TemplateApp } from "./index.js";
import type { SiteConfig } from "@zhansite/site-config";

declare const __SITE_CONFIG__: SiteConfig;

createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <TemplateApp config={__SITE_CONFIG__} />
  </HashRouter>
);
