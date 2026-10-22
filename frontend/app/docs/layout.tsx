import type { ReactNode } from "react";
import { DocsNav } from "../../components/docs/DocsNav";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="docs-shell">
      <DocsNav />
      {children}
    </div>
  );
}
