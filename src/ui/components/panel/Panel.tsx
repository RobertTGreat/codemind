import type { HTMLAttributes } from "react";
import { cn } from "../../lib/classNames";

export function Panel({ className, ...panelProps }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("min-h-0 border-zinc-800 bg-zinc-950/80", className)}
      {...panelProps}
    />
  );
}
