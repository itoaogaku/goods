"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WixSyncResult } from "@/lib/wix-sync";

interface WixSyncButtonProps {
  onSynced: () => void;
}

export function WixSyncButton({ onSynced }: WixSyncButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/acc/sync-wix", { method: "POST" });
      const raw = await res.text();
      let data: (WixSyncResult & { error?: string }) | null = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        // Not JSON — e.g. Vercel's own timeout/error page rather than our
        // route's response. Fall through to the generic message below.
      }
      if (!res.ok || !data) {
        throw new Error(data?.error ?? `同期に失敗しました（HTTP ${res.status}）。時間をおいて再度お試しください`);
      }

      const parts = [`新規${data.created}件`, `ステータス更新${data.statusUpdated}件`, `変更なし${data.skipped}件`];
      if (data.errors.length > 0) parts.push(`失敗${data.errors.length}件`);
      if (data.truncated) parts.push("未処理分あり・次回同期で継続");
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
