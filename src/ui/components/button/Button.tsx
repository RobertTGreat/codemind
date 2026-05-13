import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/classNames";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export function Button({
  className,
  variant = "secondary",
  icon,
  children,
  ...buttonProps
}: ButtonProps) {
  const variantClassName = {
    primary: "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
    secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
    ghost: "bg-transparent text-zinc-300 hover:bg-zinc-800",
    danger: "bg-red-500/15 text-red-200 hover:bg-red-500/25",
  }[variant];

  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variantClassName,
        className,
      )}
      {...buttonProps}
    >
      {icon}
      {children}
    </button>
  );
}
