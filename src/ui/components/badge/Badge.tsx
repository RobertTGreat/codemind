import type { HTMLAttributes } from "react";
import { cn } from "../../lib/classNames";

export function Badge({ className, ...badgeProps }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-1 text-xs font-medium text-zinc-300 ring-1 ring-inset ring-zinc-700",
        className,
      )}
      {...badgeProps}
    />
  );
}
