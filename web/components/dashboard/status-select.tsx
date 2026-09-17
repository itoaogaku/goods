"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Ledger, OrderStatus } from "@/lib/types";

const STATUS_OPTIONS: OrderStatus[] = ["未発送", "発送済", "キャンセル", "返金"];

const STATUS_BADGE_VARIANT: Record<OrderStatus, "warning" | "success" | "destructive" | "secondary"> = {
  未発送: "warning",
  発送済: "success",
  キャンセル: "destructive",
  返金: "secondary",
};

interface StatusSelectProps {
  ledger: Ledger;
  /** A single line's pageId, or every pageId belonging to one 取引ID (e.g. 発送管理's grouped-by-order row) — all are updated together. */
  pageId: string | string[];
  status: OrderStatus;
  onUpdated?: (status: OrderStatus) => void;
}

export function StatusSelect({ ledger, pageId, status, onUpdated }: StatusSelectProps) {
  const [current, setCurrent] = useState(status);
  const [updating, setUpdating] = useState(false);

  async function handleChange(next: OrderStatus) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setUpdating(true);
    try {
      const pageIds = Array.isArray(pageId) ? pageId : [pageId];
      const results = await Promise.all(
        pageIds.map((id) =>
          fetch(`/api/${ledger}/event/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pageId: id, status: next }),
          })
        )
      );
      if (results.some((res) => !res.ok)) throw new Error();
      onUpdated?.(next);
    } catch {
      setCurrent(previous);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <Select value={current} onValueChange={(v) => handleChange(v as OrderStatus)}>
      <SelectTrigger
        disabled={updating}
        className={cn(
          badgeVariants({ variant: STATUS_BADGE_VARIANT[current] }),
          "h-auto w-auto gap-1 border-none px-2.5 py-0.5 text-xs font-semibold shadow-none"
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
