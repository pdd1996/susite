import type { SiteConfig } from "@zhansite/site-config";
import { Link, Navigate, Route, Routes } from "react-router-dom";

type Props = { config: SiteConfig; assetUrls?: Record<string, string> };

export function SitePage({ config, assetUrls = {} }: Props) {
  return (
    <main style={{ fontFamily: "Arial, 'Microsoft YaHei', sans-serif", color: "#1a1a1a" }}>
      <section style={{ background: config.brand.primaryColor, color: "white", padding: "72px 8vw" }}>
        <h1>{config.home.hero.title}</h1>
        <p>{config.home.hero.summary}</p>
      </section>
      <section style={{ padding: "48px 8vw" }}>
        <h2>产品中心</h2>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {config.products.categories.map((category) => (
            <article id={category.slug} key={category.id} style={{ border: "1px solid #e8e8e8", padding: 20 }}>
              <h3>{category.name}</h3>
              <p>{category.summary}</p>
              <ul>
                {category.series.map((series) => (
                  <li key={series.id}>
                    {series.imageAssetId && assetUrls[series.imageAssetId] ? (
                      <img
                        src={assetUrls[series.imageAssetId]}
                        alt={series.name}
                        style={{ display: "block", height: 160, objectFit: "contain", width: "100%" }}
                      />
                    ) : null}
                    <strong>{series.name}</strong>：{series.sellingPoint}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
      <section id="contact" style={{ background: "#f7f7f7", padding: "48px 8vw" }}>
        <h2>联系我们</h2>
        <p>{config.contact.address}</p>
        <a href={`tel:${config.contact.phone}`}>{config.contact.phone}</a>
      </section>
    </main>
  );
}

function Shell({ config, assetUrls = {}, children }: Props & { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "Arial, 'Microsoft YaHei', sans-serif", color: "#1a1a1a" }}>
      <header style={{ borderBottom: "1px solid #e8e8e8", padding: "16px 8vw" }}>
        {assetUrls[config.brand.logoAssetId] ? (
          <img
            src={assetUrls[config.brand.logoAssetId]}
            alt={`${config.brand.name} Logo`}
            style={{ height: 48, objectFit: "contain" }}
          />
        ) : null}
        <strong>{config.brand.name}</strong>
        <nav style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12 }}>
          <Link to="/">首页</Link>
          <Link to="/products">产品中心</Link>
          <Link to="/certifications">资质认证</Link>
          <Link to="/about">关于我们</Link>
          <Link to="/contact">联系我们</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section style={{ padding: "48px 8vw" }}>
    <h1>{title}</h1>
    {children}
  </section>
);

export function TemplateApp({ config, assetUrls = {} }: Props) {
  return (
    <Shell config={config} assetUrls={assetUrls}>
      <Routes>
        <Route path="/" element={<SitePage config={config} assetUrls={assetUrls} />} />
        <Route
          path="/products"
          element={
            <Section title="产品中心">
              {config.products.categories.map((category) => (
                <article id={category.slug} key={category.id}>
                  <h2>{category.name}</h2>
                  <p>{category.summary}</p>
                  {category.series.map((series) => (
                    <div key={series.id}>
                      {series.imageAssetId && assetUrls[series.imageAssetId] ? (
                        <img
                          src={assetUrls[series.imageAssetId]}
                          alt={series.name}
                          style={{ maxHeight: 240, maxWidth: "100%", objectFit: "contain" }}
                        />
                      ) : null}
                      <p><strong>{series.name}</strong>：{series.sellingPoint}</p>
                    </div>
                  ))}
                </article>
              ))}
            </Section>
          }
        />
        <Route
          path="/certifications"
          element={
            <Section title="资质认证">
              {config.certifications.groups.length === 0 ? (
                <p>资质素材待补齐。</p>
              ) : (
                config.certifications.groups.map((group) => (
                  <section key={group.name}>
                    <h2>{group.name}</h2>
                    {group.items.map((item) => (
                      <figure key={item.assetId}>
                        {assetUrls[item.assetId] ? (
                          <img
                            src={assetUrls[item.assetId]}
                            alt={item.name}
                            style={{ maxHeight: 320, maxWidth: "100%", objectFit: "contain" }}
                          />
                        ) : null}
                        <figcaption>{item.name}</figcaption>
                      </figure>
                    ))}
                  </section>
                ))
              )}
            </Section>
          }
        />
        <Route
          path="/about"
          element={
            <Section title="关于我们">
              <p>{config.about.introduction}</p>
              {config.about.factoryImageAssetIds?.map((assetId, index) =>
                assetUrls[assetId] ? (
                  <img
                    key={assetId}
                    src={assetUrls[assetId]}
                    alt={`厂房实景 ${index + 1}`}
                    style={{ maxHeight: 360, maxWidth: "100%", objectFit: "cover" }}
                  />
                ) : null
              )}
            </Section>
          }
        />
        <Route
          path="/contact"
          element={
            <Section title="联系我们">
              <p>{config.contact.address}</p>
              <a href={`tel:${config.contact.phone}`}>{config.contact.phone}</a>
              {config.contact.wechatQrAssetId && assetUrls[config.contact.wechatQrAssetId] ? (
                <img
                  src={assetUrls[config.contact.wechatQrAssetId]}
                  alt="微信联系二维码"
                  style={{ display: "block", height: 180, marginTop: 20, width: 180 }}
                />
              ) : null}
            </Section>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {config.assets.pdfCatalogAssetId && assetUrls[config.assets.pdfCatalogAssetId] ? (
        <a
          href={assetUrls[config.assets.pdfCatalogAssetId]}
          download
          style={{ bottom: 20, position: "fixed", right: 20 }}
        >
          下载产品样本
        </a>
      ) : null}
    </Shell>
  );
}
