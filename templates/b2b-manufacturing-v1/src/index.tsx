import type { SiteConfig } from "@zhansite/site-config";
import { Link, Navigate, Route, Routes } from "react-router-dom";

type Props = { config: SiteConfig };

export function SitePage({ config }: Props) {
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

function Shell({ config, children }: Props & { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "Arial, 'Microsoft YaHei', sans-serif", color: "#1a1a1a" }}>
      <header style={{ borderBottom: "1px solid #e8e8e8", padding: "16px 8vw" }}>
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

export function TemplateApp({ config }: Props) {
  return (
    <Shell config={config}>
      <Routes>
        <Route path="/" element={<SitePage config={config} />} />
        <Route
          path="/products"
          element={
            <Section title="产品中心">
              {config.products.categories.map((category) => (
                <article id={category.slug} key={category.id}>
                  <h2>{category.name}</h2>
                  <p>{category.summary}</p>
                </article>
              ))}
            </Section>
          }
        />
        <Route
          path="/certifications"
          element={
            <Section title="资质认证">
              {config.certifications.groups.length === 0
                ? <p>资质素材待补齐。</p>
                : config.certifications.groups.map((group) => <h2 key={group.name}>{group.name}</h2>)}
            </Section>
          }
        />
        <Route
          path="/about"
          element={
            <Section title="关于我们">
              <p>{config.about.introduction}</p>
            </Section>
          }
        />
        <Route
          path="/contact"
          element={
            <Section title="联系我们">
              <p>{config.contact.address}</p>
              <a href={`tel:${config.contact.phone}`}>{config.contact.phone}</a>
            </Section>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
