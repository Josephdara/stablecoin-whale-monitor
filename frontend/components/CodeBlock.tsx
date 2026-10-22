import type { ReactNode } from "react";
import { CopyButton } from "./CopyButton";
import { ExampleTag } from "./ui";

type Props = {
  title: string;
  code: string;
  example?: boolean;
  label?: ReactNode;
};

export function CodeBlock({ title, code, example = false, label }: Props) {
  return (
    <div className="code">
      <div className="code-head">
        <span className="row gap-10">
          {label ?? title}
          {example ? <ExampleTag small /> : null}
        </span>
        <span className="row gap-6">
          <CopyButton value={code} label={`Copy ${title.toLowerCase()}`} />
        </span>
      </div>
      <pre tabIndex={0} aria-label={title}>{code}</pre>
    </div>
  );
}
