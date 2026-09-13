"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ProductSyncResult {
  checked: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

interface ProductSyncButtonProps {
  onSynced: () => void;
}

export function ProductSyncButton({ onSynced }: ProductSyncButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/products/sync-wix", { method: "POST" });
      const raw = await res.text();
      let data: (ProductSyncResult & { error?: string; detail?: string }) | null = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        // Not JSON — e.g. a platform timeout/error page rather than our route's response.
      }
      if (!res.ok || !data) {
        throw new Error(data?.detail ?? data?.error ?? `同期に失敗しました（HTTP ${res.status}）`);
      }

      const parts = [`新規${data.created}件`, `更新${data.updated}件`, `変更なし${data.skipped}件`];
      if (data.errors.length > 0) parts.push(`失敗${data.errors.length}件`);
      setMessage({ type: "success", text: `Wixと同期しました（${parts.join("・")}）` });
      onSynced();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Wixとの同期に失敗しました",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={loading}>
        {loading ? "同期中…" : "今すぐWixと同期"}
      </Button>
      {message && (
        <p className={`text-xs ${message.type === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
