import { useEffect, useMemo, useRef, useState } from "react";
import type { SiteConfig } from "@zhansite/site-config";
import { parseConfigJson } from "./config-json.js";

const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

export const initialConfig: SiteConfig = {
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
type Asset = {
  assetId: string;
  type: string;
  status: string;
  sourceKind: "customer_provided" | "placeholder";
  placeholderApprovedBy?: string;
  originalFilename: string;
};
type Deployment = {
  jobId: string;
  revision: number;
  status: string;
  kind?: "publish" | "rollback";
  attemptCount?: number;
  maxAttempts?: number;
  nextAttemptAt?: string;
  lastErrorCode?: string;
  lastErrorClass?: "transient" | "permanent" | "concurrency";
  servingPreviousHealthyVersion?: boolean;
  placeholderAssetIds: string[];
  previewUrl?: string;
  errorSummary?: string;
};
type PreviewState = {
  activeArtifactId: string;
  activeDeploymentId: string;
  revision?: number;
  previewUrl: string;
  version: number;
  activatedAt: string;
};
type ReadyArtifact = {
  artifactId: string;
  revision: number;
  templateVersion: string;
  createdAt: string;
};
type DeploymentEvent = {
  eventId: string;
  attempt: number;
  sequence: number;
  stage: string;
  level: string;
  code: string;
  message: string;
  createdAt: string;
};

const assetTypes = [
  ["logo", "Logo"],
  ["product_image", "产品图"],
  ["certificate_image", "证书图"],
  ["product_pdf", "产品 PDF"],
  ["wechat_qr", "微信二维码"],
  ["factory_image", "厂房图"]
] as const;

const putWithProgress = (
  url: string,
  method: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void
) =>
  new Promise<boolean>((resolve) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => resolve(request.status >= 200 && request.status < 300));
    request.addEventListener("error", () => resolve(false));
    request.send(file);
  });

export function App({ apiBaseUrl = defaultApiBaseUrl }: { apiBaseUrl?: string }) {
  const initialText = useMemo(() => JSON.stringify(initialConfig, null, 2), []);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("jinyuan-20260524");
  const [configText, setConfigText] = useState(initialText);
  const [savedConfigText, setSavedConfigText] = useState(initialText);
  const [baseRevision, setBaseRevision] = useState(0);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [message, setMessage] = useState("");
  const [conflictRevision, setConflictRevision] = useState<number>();
  const [assetType, setAssetType] = useState("logo");
  const [sourceKind, setSourceKind] = useState<"customer_provided" | "placeholder">("customer_provided");
  const [uploadFile, setUploadFile] = useState<File>();
  const [uploadProgress, setUploadProgress] = useState<number>();
  const [deployment, setDeployment] = useState<Deployment>();
  const [previewState, setPreviewState] = useState<PreviewState>();
  const [readyArtifacts, setReadyArtifacts] = useState<ReadyArtifact[]>([]);
  const [deploymentEvents, setDeploymentEvents] = useState<DeploymentEvent[]>([]);
  const [reliabilityError, setReliabilityError] = useState("");
  const [deploymentEventsError, setDeploymentEventsError] = useState("");
  const activeSiteIdRef = useRef(siteId);

  const request = (path: string, init?: RequestInit) => fetch(`${apiBaseUrl}${path}`, init);
  const loadSites = async () => {
    const response = await request("/sites");
    if (!response.ok) throw new Error("站点列表请求失败");
    const loaded: Site[] = await response.json();
    setSites(loaded);
    return loaded;
  };
  const loadAssets = async (selectedSiteId: string) => {
    const response = await request(`/sites/${selectedSiteId}/assets`);
    const loaded = response.ok ? await response.json() : [];
    if (activeSiteIdRef.current === selectedSiteId) setAssets(loaded);
  };
  const loadHistory = async (selectedSiteId: string) => {
    const response = await request(`/sites/${selectedSiteId}/revisions`);
    if (!response.ok) throw new Error("无法读取 Revision 历史。");
    const history: Revision[] = await response.json();
    if (activeSiteIdRef.current === selectedSiteId) setRevisions(history);
    return history;
  };
  const loadPreviewState = async (selectedSiteId: string) => {
    const response = await request(`/sites/${selectedSiteId}/preview-state`);
    if (response.status === 404) {
      if (activeSiteIdRef.current === selectedSiteId) setPreviewState(undefined);
      return;
    }
    if (!response.ok) throw new Error("无法读取当前健康版本。");
    const state = await response.json();
    if (activeSiteIdRef.current === selectedSiteId) setPreviewState(state);
  };
  const loadReadyArtifacts = async (selectedSiteId: string) => {
    const response = await request(`/sites/${selectedSiteId}/artifacts`);
    if (!response.ok) throw new Error("无法读取可回滚版本。");
    const artifacts = await response.json();
    if (activeSiteIdRef.current === selectedSiteId) setReadyArtifacts(artifacts);
  };
  const loadReliability = async (selectedSiteId: string) => {
    if (activeSiteIdRef.current === selectedSiteId) setReliabilityError("");
    const results = await Promise.allSettled([
      loadPreviewState(selectedSiteId),
      loadReadyArtifacts(selectedSiteId)
    ]);
    if (
      activeSiteIdRef.current === selectedSiteId &&
      results.some((result) => result.status === "rejected")
    ) {
      setReliabilityError("可靠性数据暂不可用，请稍后刷新。");
    }
  };

  useEffect(() => {
    void loadSites().catch((error) => setMessage(error instanceof Error ? error.message : "无法连接 API"));
  }, []);

  const applyRevision = (revision: Revision) => {
    const text = JSON.stringify(revision.config, null, 2);
    setConfigText(text);
    setSavedConfigText(text);
    setBaseRevision(revision.revision);
    setSourceRevision(revision.revision);
    setConflictRevision(undefined);
  };

  const selectSite = async (site: Site) => {
    activeSiteIdRef.current = site.siteId;
    setSiteId(site.siteId);
    setDeployment(undefined);
    setDeploymentEvents([]);
    setDeploymentEventsError("");
    setPreviewState(undefined);
    setReadyArtifacts([]);
    setReliabilityError("");
    const history = await loadHistory(site.siteId);
    if (activeSiteIdRef.current !== site.siteId) return;
    if (history[0]) applyRevision(history[0]);
    await loadAssets(site.siteId);
    await loadReliability(site.siteId);
  };

  const createSite = async () => {
    let config: SiteConfig;
    try {
      config = parseConfigJson(configText);
    } catch {
      return setMessage("配置 JSON 不合法或不符合 SiteConfig 契约。");
    }
    const response = await request("/sites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteId,
        name: config.brand.name,
        template: "b2b-manufacturing-v1",
        config
      })
    });
    const payload = await response.json();
    if (!response.ok) return setMessage(`创建失败：${payload.error}`);
    setMessage("站点与 revision 1 已创建。");
    await loadSites();
    await selectSite(payload.site);
  };

  const saveRevision = async () => {
    let config: SiteConfig;
    try {
      config = parseConfigJson(configText);
    } catch {
      return setMessage("配置 JSON 不合法或不符合 SiteConfig 契约。");
    }
    const response = await request(`/sites/${siteId}/revisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: baseRevision, config })
    });
    const payload = await response.json();
    if (payload.error === "revision_conflict") {
      setConflictRevision(payload.currentRevision);
      return setMessage(`版本冲突：服务器当前为 revision ${payload.currentRevision}，本地内容尚未覆盖。`);
    }
    if (!response.ok) return setMessage(`保存失败：${payload.error}`);
    setMessage(`已保存 revision ${payload.revision}。`);
    setSavedConfigText(configText);
    setBaseRevision(payload.revision);
    setSourceRevision(payload.revision);
    setConflictRevision(undefined);
    await loadSites();
    await loadHistory(siteId);
  };

  const reloadLatest = async () => {
    if (configText !== savedConfigText && !window.confirm("重新加载会丢弃本地未保存内容，是否继续？")) return;
    const history = await loadHistory(siteId);
    if (history[0]) applyRevision(history[0]);
    setMessage("已重新加载服务器最新 Revision。");
  };

  const loadHistoricalRevision = (revision: Revision) => {
    if (configText !== savedConfigText && !window.confirm("加载历史版本会丢弃本地未保存内容，是否继续？")) return;
    const text = JSON.stringify(revision.config, null, 2);
    const latestRevision = revisions[0]?.revision ?? revision.revision;
    setConfigText(text);
    setSavedConfigText(text);
    setSourceRevision(revision.revision);
    setBaseRevision(latestRevision);
    setConflictRevision(undefined);
    setMessage(
      `已加载 revision ${revision.revision} 的内容；保存时将基于服务器当前 revision ${latestRevision} 创建新版本。`
    );
  };

  const uploadAsset = async () => {
    if (!uploadFile) return setMessage("请先选择文件。");
    const signResponse = await request(`/sites/${siteId}/upload/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: assetType,
        contentType: uploadFile.type,
        sizeBytes: uploadFile.size,
        originalFilename: uploadFile.name,
        sourceKind
      })
    });
    const signed = await signResponse.json();
    if (!signResponse.ok) return setMessage(`签名失败：${signed.error}`);
    setMessage("素材上传中……");
    setUploadProgress(0);
    const uploadUrl = new URL(signed.url, `${apiBaseUrl}/`).toString();
    const uploaded = await putWithProgress(
      uploadUrl,
      signed.method,
      signed.headers,
      uploadFile,
      setUploadProgress
    );
    if (!uploaded) return setMessage("素材直传失败。");
    setUploadProgress(100);
    const completeResponse = await request(`/sites/${siteId}/assets/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadToken: signed.uploadToken })
    });
    const completed = await completeResponse.json();
    if (!completeResponse.ok) return setMessage(`素材复核失败：${completed.error}`);
    setMessage(`素材已复核：${completed.assetId}`);
    await loadAssets(siteId);
  };

  const createDeployment = async () => {
    const selectedSiteId = siteId;
    const response = await request(`/sites/${selectedSiteId}/deployments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision: sourceRevision, idempotencyKey: crypto.randomUUID() })
    });
    const payload = await response.json();
    if (!response.ok) return setMessage(`创建预览失败：${payload.error}`);
    if (activeSiteIdRef.current !== selectedSiteId) return;
    setDeployment(payload);
    setDeploymentEvents([]);
    setDeploymentEventsError("");
    setMessage(`预览任务已创建：${payload.jobId}`);
  };

  const loadDeploymentEvents = async (selectedSiteId: string, jobId: string) => {
    try {
      const response = await request(`/sites/${selectedSiteId}/deployments/${jobId}/events`);
      if (activeSiteIdRef.current !== selectedSiteId) return;
      if (!response.ok) {
        setDeploymentEvents([]);
        setDeploymentEventsError("阶段日志暂不可用。");
        return;
      }
      const events = await response.json();
      if (activeSiteIdRef.current !== selectedSiteId) return;
      setDeploymentEvents(events);
      setDeploymentEventsError("");
    } catch {
      if (activeSiteIdRef.current !== selectedSiteId) return;
      setDeploymentEvents([]);
      setDeploymentEventsError("阶段日志暂不可用。");
    }
  };

  const refreshDeployment = async () => {
    if (!deployment) return;
    const selectedSiteId = siteId;
    const jobId = deployment.jobId;
    const response = await request(`/sites/${selectedSiteId}/deployments/${jobId}`);
    const payload = await response.json();
    if (!response.ok) return setMessage(`查询任务失败：${payload.error}`);
    if (activeSiteIdRef.current !== selectedSiteId) return;
    setDeployment(payload);
    await Promise.all([
      loadDeploymentEvents(selectedSiteId, payload.jobId),
      loadReliability(selectedSiteId)
    ]);
    setMessage(`预览任务状态：${payload.status}`);
  };

  useEffect(() => {
    if (!deployment || !["queued", "building", "deploying", "retry_waiting"].includes(deployment.status)) return;
    const timer = window.setTimeout(() => void refreshDeployment(), 2000);
    return () => window.clearTimeout(timer);
  }, [deployment?.jobId, deployment?.status]);

  const copyPreviewUrl = async () => {
    if (!deployment?.previewUrl) return;
    await navigator.clipboard.writeText(deployment.previewUrl);
    setMessage("预览链接已复制。");
  };

  const rollbackArtifact = async (artifact: ReadyArtifact) => {
    if (!window.confirm(
      `确认回滚到 revision ${artifact.revision}（artifact ${artifact.artifactId}）？`
    )) return;
    const selectedSiteId = siteId;
    const response = await request(`/sites/${selectedSiteId}/rollbacks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artifactId: artifact.artifactId, idempotencyKey: crypto.randomUUID() })
    });
    const payload = await response.json();
    if (!response.ok) return setMessage(`回滚失败：${payload.error}`);
    if (activeSiteIdRef.current !== selectedSiteId) return;
    setDeployment(payload);
    setDeploymentEvents([]);
    setDeploymentEventsError("");
    setMessage(`回滚任务已创建：${payload.jobId}`);
  };

  return (
    <main style={{ fontFamily: "Arial, 'Microsoft YaHei', sans-serif", margin: "40px auto", maxWidth: 920 }}>
      <h1>展站运营后台 · Phase 3 本地可靠性</h1>
      <label>Site ID <input value={siteId} onChange={(event) => setSiteId(event.target.value)} /></label>
      <label>
        SiteConfig JSON
        <textarea
          aria-label="SiteConfig JSON"
          rows={20}
          style={{ display: "block", fontFamily: "monospace", marginTop: 8, width: "100%" }}
          value={configText}
          onChange={(event) => setConfigText(event.target.value)}
        />
      </label>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button onClick={() => void createSite()}>创建站点</button>
        <button onClick={() => void saveRevision()}>保存新 Revision</button>
        {conflictRevision ? <button onClick={() => void reloadLatest()}>重新加载最新版本</button> : null}
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
            <button onClick={() => loadHistoricalRevision(revision)}>加载此版本</button>
          </li>
        ))}
      </ol>

      <h2>素材上传</h2>
      <label>
        素材类型
        <select value={assetType} onChange={(event) => setAssetType(event.target.value)}>
          {assetTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>
        来源
        <select
          value={sourceKind}
          onChange={(event) => setSourceKind(event.target.value as typeof sourceKind)}
        >
          <option value="customer_provided">客户提供</option>
          <option value="placeholder">占位素材</option>
        </select>
      </label>
      {sourceKind === "placeholder" ? <p>批准人将由服务端已认证的运营身份记录。</p> : null}
      <input aria-label="选择素材文件" type="file" onChange={(event) => setUploadFile(event.target.files?.[0])} />
      <button onClick={() => void uploadAsset()}>上传并复核</button>
      {uploadProgress !== undefined ? <progress aria-label="上传进度" max={100} value={uploadProgress} /> : null}
      <ul>
        {assets.map((asset) => (
          <li key={asset.assetId}>
            {asset.originalFilename} · {asset.type} · {asset.status} ·
            {asset.sourceKind === "placeholder"
              ? `占位（${asset.placeholderApprovedBy ? `已由 ${asset.placeholderApprovedBy} 批准` : "未批准"}）`
              : "真实素材"}
          </li>
        ))}
      </ul>

      <h2>HTTPS 预览</h2>
      <p>当前内容来源：revision {sourceRevision}；保存基线：revision {baseRevision}</p>
      <section aria-label="当前健康版本">
        <h3>当前健康版本</h3>
        {reliabilityError ? <p role="alert">{reliabilityError}</p> : null}
        {previewState ? (
          <p>
            revision {previewState.revision ?? "未知"} · artifact {previewState.activeArtifactId} ·
            版本 {previewState.version} · 激活于 {previewState.activatedAt} ·
            <a href={previewState.previewUrl}>打开当前预览</a>
          </p>
        ) : <p>尚无健康版本。</p>}
      </section>
      <button disabled={sourceRevision < 1} onClick={() => void createDeployment()}>创建预览</button>
      <button disabled={!deployment} onClick={() => void refreshDeployment()}>刷新任务状态</button>
      {deployment ? (
        <>
          <p>
            {deployment.jobId} · {deployment.kind ?? "publish"} · {deployment.status}
            {deployment.attemptCount !== undefined
              ? ` · attempt ${deployment.attemptCount}/${deployment.maxAttempts ?? 3}`
              : ""}
            {deployment.nextAttemptAt ? ` · 下次重试 ${deployment.nextAttemptAt}` : ""}
            {deployment.previewUrl ? <> · <a href={deployment.previewUrl}>打开预览</a></> : null}
            {deployment.lastErrorCode ? ` · ${deployment.lastErrorCode}` : ""}
            {deployment.errorSummary ? ` · ${deployment.errorSummary}` : ""}
          </p>
          {deployment.status === "failed" ? (
            <p role="alert">
              {deployment.servingPreviousHealthyVersion || previewState
                ? "发布失败；当前预览仍为上一健康版本。"
                : "发布失败；尚无健康版本。"}
            </p>
          ) : null}
          {deployment.placeholderAssetIds.length > 0 ? (
            <p role="alert">本次预览包含已批准占位素材：{deployment.placeholderAssetIds.join("、")}</p>
          ) : null}
          {deployment.previewUrl ? (
            <button onClick={() => void copyPreviewUrl()}>复制预览链接</button>
          ) : null}
        </>
      ) : null}
      <h3>阶段日志</h3>
      {deploymentEventsError ? <p role="alert">{deploymentEventsError}</p> : null}
      {deploymentEvents.length === 0 && !deploymentEventsError ? <p>暂无阶段日志。</p> : null}
      {deploymentEvents.length > 0 ? (
        <ol aria-label="部署阶段日志">
          {deploymentEvents.map((event) => (
            <li key={event.eventId}>
              attempt {event.attempt} · {event.stage} · {event.code} · {event.message} · {event.createdAt}
            </li>
          ))}
        </ol>
      ) : null}
      <h3>历史可回滚版本</h3>
      {readyArtifacts.length === 0 ? <p>暂无可回滚 artifact。</p> : (
        <ul>
          {readyArtifacts.map((artifact) => (
            <li key={artifact.artifactId}>
              revision {artifact.revision} · artifact {artifact.artifactId} · {artifact.createdAt}
              <button
                disabled={artifact.artifactId === previewState?.activeArtifactId}
                onClick={() => void rollbackArtifact(artifact)}
              >
                回滚到此版本
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
