"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import type { Ledger } from "@/lib/types";

interface DedupePreview {
  duplicateGroups: number;
  extraPages: number;
  sample: Array<{ lineId: string; productName: string; count: number }>;
}

interface DedupeResult {
  remainingGroups: number;
  archived: number;
  truncated: boolean;
  errors: string[];
}

interface DedupePanelProps {
  ledger: Ledger;
  onChanged: () => void;
}

export function DedupePanel({ ledger, onChanged }: DedupePanelProps) {
  const [preview, setPreview] = useState<DedupePreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleCheck() {
    setChecking(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/${ledger}/dedupe`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPreview(data);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "確認に失敗しました" });
    } finally {
      setChecking(false);
    }
  }

  async function handleArchive() {
    if (!confirm("重複している行をNotionのゴミ箱に移動します（完全削除ではなく、Notion側でいつでも復元できます）。よろしいですか？")) {
      return;
    }
    setArchiving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/${ledger}/dedupe`, { method: "POST" });
      const data: DedupeResult & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const parts = [`${data.archived}件をアーカイブ`];
      if (data.errors.length > 0) parts.push(`失敗${data.errors.length}件`);
      if (data.remainingGroups > 0) parts.push(`残り${data.remainingGroups}グループ・もう一度実行してください`);
      else parts.push("重複は解消されました");
      setMessage({ type: "success", text: parts.join("・") });

      await handleCheck();
      onChanged();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "削除に失敗しました" });
    } finally {
      setArchiving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">重複データのチェック（メンテナンス）</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          同じ明細ID（Wixの注文明細など）が複数登録されてしまっていないか確認し、まとめて片付けられます。削除ではなく
          Notionの「ゴミ箱」への移動なので、間違えてもNotion側で復元できます。
        </p>
        <Button type="button" variant="outline" size="sm" onClick={handleCheck} disabled={checking} className="self-start">
          {checking ? "確認中…" : "重複データを確認"}
        </Button>

        {preview && (
          <div className="rounded-md border border-border p-3 text-sm">
            {preview.duplicateGroups === 0 ? (
              <p>重複は見つかりませんでした。</p>
            ) : (
              <>
                <p>
                  <span className="font-medium">{formatNumber(preview.duplicateGroups)}</span> 件の明細IDで重複あり（余分な行:{" "}
                  <span className="font-medium">{formatNumber(preview.extraPages)}</span> 件）
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                  {preview.sample.map((s) => (
                    <li key={s.lineId}>
                      {s.lineId}（{s.productName || "商品名なし"}）— {s.count}件
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleArchive}
                  disabled={archiving}
                  className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
                >
                  {archiving ? "処理中…" : "重複をアーカイブ（ゴミ箱へ移動）"}
                </Button>
              </>
            )}
          </div>
        )}

        {message && (
          <p className={`text-sm ${message.type === "error" ? "text-destructive" : "text-emerald-600"}`}>
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
