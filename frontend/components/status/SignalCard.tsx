import type { ReactNode } from "react";
import { Icon, type IconName } from "../Icon";

type Props = {
  icon: IconName;
  title: string;
  status: ReactNode;
  children?: ReactNode;
  rows?: Array<[string, ReactNode]>;
};

export function SignalCard({ icon, title, status, children, rows = [] }: Props) {
  return (
    <article className="card sig-card">
      <div className="row spread gap-12">
        <h3 className="h4 row gap-8"><Icon name={icon} size={20} />{title}</h3>
        {status}
      </div>
      {children ? <p className="small muted">{children}</p> : null}
      {rows.map(([label, value]) => (
        <div className="kv" key={label}>
          <span>{label}</span>
          <span className="num">{value}</span>
        </div>
      ))}
    </article>
  );
}
