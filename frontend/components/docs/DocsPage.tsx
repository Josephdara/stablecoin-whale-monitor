import Link from "next/link";
import type { ReactNode } from "react";
import { SITE } from "../../lib/config";
import { Icon } from "../Icon";

type PageLink = { href: string; label: string };

export function DocsPage({
  section,
  title,
  lead,
  note,
  toc,
  previous,
  next,
  children,
}: {
  section: string;
  title: string;
  lead: string;
  note?: ReactNode;
  toc: Array<{ id: string; label: string }>;
  previous?: PageLink;
  next?: PageLink;
  children: ReactNode;
}) {
  return (
    <>
      <main id="content" className="docs-main prose">
        <nav aria-label="Breadcrumb" className="small subtle" style={{ marginBottom: 12 }}>
          <Link href="/docs/">Docs</Link> / {section}
        </nav>
        <h1 className="h1">{title}</h1>
        <p className="lead" style={{ marginBottom: note ? 8 : 24 }}>{lead}</p>
        {note ? <p className="small subtle" style={{ marginBottom: 24, fontSize: 13, lineHeight: "20px" }}>{note}</p> : null}
        {children}
        {previous || next ? (
          <nav aria-label="Previous and next" className="pager-cards">
            {previous ? (
              <Link className="card" href={previous.href}>
                <span className="small subtle">Previous</span>
                <span className="strong" style={{ color: "var(--text)" }}>{previous.label}</span>
              </Link>
            ) : null}
            {next ? (
              <Link className="card next" href={next.href}>
                <span className="small subtle">Next</span>
                <span className="strong" style={{ color: "var(--text)" }}>{next.label}</span>
              </Link>
            ) : null}
          </nav>
        ) : null}
        <p className="small subtle" style={{ marginTop: 32, fontSize: 13 }}>
          Found a problem in this page? <a href={SITE.issues}>Open an issue in the repository.</a>
        </p>
      </main>
      {toc.length ? (
        <aside className="toc" aria-label="On this page">
          <p className="overline" style={{ marginBottom: 10 }}>On this page</p>
          {toc.map((item) => (
            <a key={item.id} href={`#${item.id}`}>{item.label}</a>
          ))}
        </aside>
      ) : null}
    </>
  );
}

function anchorLabel(children: ReactNode) {
  return typeof children === "string" ? `Link to ${children}` : "Link to this section";
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id}>
      {children}
      <a className="anchor" href={`#${id}`} aria-label={anchorLabel(children)}><Icon name="anchor" /></a>
    </h2>
  );
}

export function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id}>
      {children}
      <a className="anchor" href={`#${id}`} aria-label={anchorLabel(children)}><Icon name="anchor" /></a>
    </h3>
  );
}
