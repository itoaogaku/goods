import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        // dark:のバリアントは意図的に使わない — このアプリはダークモード非対応で、
        // 常にライトパレット固定（app/globals.css参照）。dark:を付けると、
        // OS/ブラウザ側がダークモードのときだけバッジが暗い半透明背景+薄い文字色
        // になり、このアプリの明るい背景の上では逆にコントラストが下がって
        // 見にくくなってしまう。
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-emerald-100 text-emerald-800",
        warning: "border-transparent bg-amber-100 text-amber-800",
        destructive: "border-transparent bg-red-100 text-red-800",
        outline: "text-foreground",
        blue: "border-transparent bg-blue-100 text-blue-800",
        violet: "border-transparent bg-violet-100 text-violet-800",
        pink: "border-transparent bg-pink-100 text-pink-800",
        orange: "border-transparent bg-orange-100 text-orange-800",
        indigo: "border-transparent bg-indigo-100 text-indigo-800",
        cyan: "border-transparent bg-cyan-100 text-cyan-800",
        rose: "border-transparent bg-rose-100 text-rose-800",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
