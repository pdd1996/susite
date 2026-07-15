import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { SiteConfig } from "@zhansite/site-config";
import { parseConfigJson } from "./config-json.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

const initialConfig: SiteConfig = {
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
      summary: "适用于低压配电与测量场景",
      series: [{ id: "lmk1-bh", name: "LMK1(BH)-0.66", sellingPoint: "开启式结构，免拆线安装" }]
    }]
  },
  certifications: { groups: [] },
  about: { introduction: "专业生产互感器产品。", principles: ["以质量求生存"], industries: ["电网"] }
};

type Site = { siteId: string; name: string; template: string; currentRevision: number };
type Revision = {
  siteId: string;
  revision: number;
  schemaVersion: string;
  config: SiteConfig;
  createdBy: string;
  createdAt: string;
};

function App() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("jinyuan-20260524");
  const [configText, setConfigText] = useState(JSON.stringify(initialConfig, null, 2));
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [message, setMessage] = useState("");

  const loadSites = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/sites`);
      if (!response.ok) throw new Error("站点列表请求失败");
      setSites(await response.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法连接 API");
    }
  };

  const selectSite = async (site: Site) => {
    setSiteId(site.siteId);
    const response = await fetch(`${apiBaseUrl}/sites/${site.siteId}/revisions`);
    if (!response.ok) return setMessage("无法读取 Revision 历史。");
    const history: Revision[] = await response.json();
    setRevisions(history);
    if (history[0]) setConfigText(JSON.stringify(history[0].config, null, 2));
  };

  useEffect(() => {
    void loadSites();
  }, []);

  const createSite = async () => {
    let config: SiteConfig;
    try {
      config = parseConfigJson(configText);
    } catch {
      return setMessage("配置 JSON 不合法或不符合 SiteConfig 契约。");
    }
    const response = await fetch(`${apiBaseUrl}/sites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId, name: config.brand.name, template: "b2b-manufacturing-v1" })
    });
    setMessage(response.ok ? "站点已创建。" : `创建失败：${(await response.json()).error}`);
    if (response.ok) await loadSites();
  };

  const saveRevision = async () => {
    const site = sites.find((item) => item.siteId === siteId);
    if (!site) return setMessage("请先创建站点。");
    let config: SiteConfig;
    try {
      config = parseConfigJson(configText);
    } catch {
      return setMessage("配置 JSON 不合法或不符合 SiteConfig 契约。");
    }

    const response = await fetch(`${apiBaseUrl}/sites/${siteId}/revisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: site.currentRevision, config })
    });
    const payload = await response.json();
    setMessage(
      response.ok
        ? `已保存 revision ${payload.revision}。`
        : payload.error === "revision_conflict"
          ? `版本冲突：服务器当前为 revision ${payload.currentRevision}，请重新选择站点加载最新版本。`
          : `保存失败：${payload.error}`
    );
    if (response.ok) {
      await loadSites();
      await selectSite({ ...site, currentRevision: payload.revision });
    }
  };

  return (
    <main style={{ fontFamily: "Arial, 'Microsoft YaHei', sans-serif", margin: "40px auto", maxWidth: 760 }}>
      <h1>展站运营后台 · Phase 1</h1>
      <p>创建站点并保存不可变配置版本；素材上传和预览部署将在后续阶段接入。</p>
      <label>
        Site ID
        <input value={siteId} onChange={(event) => setSiteId(event.target.value)} />
      </label>
      <label>
        SiteConfig JSON
        <textarea
          rows={24}
          style={{ display: "block", fontFamily: "monospace", marginTop: 8, width: "100%" }}
          value={configText}
          onChange={(event) => setConfigText(event.target.value)}
        />
      </label>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button onClick={() => void createSite()}>创建站点</button>
        <button onClick={() => void saveRevision()}>保存新 Revision</button>
      </div>
      <p role="status">{message}</p>
      <h2>站点列表</h2>
      <ul>
        {sites.map((site) => (
          <li key={site.siteId}>
            <button onClick={() => void selectSite(site)}>
              {site.name}（{site.siteId}，revision {site.currentRevision}）
            </button>
          </li>
        ))}
      </ul>
      <h2>Revision 历史</h2>
      <ol>
        {revisions.map((revision) => (
          <li key={revision.revision}>
            revision {revision.revision} · {revision.createdBy} · {revision.createdAt}
          </li>
        ))}
      </ol>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
