"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LEDGER_CONFIG } from "@/lib/ledger";
import type { Ledger, Location } from "@/lib/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface StockInFormProps {
  ledger: Ledger;
  onSuccess: () => void;
}

export function StockInForm({ ledger, onSuccess }: StockInFormProps) {
  const config = LEDGER_CONFIG[ledger];

  const [productName, setProductName] = useState("");
  const [occurredAt, setOccurredAt] = useState(today());
  const [quantities, setQuantities] = useState<Partial<Record<Location, string>>>({});
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/${ledger}/stock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          occurredAt,
          quantities: Object.fromEntries(
            Object.entries(quantities).map(([loc, v]) => [loc, Number(v) || 0])
          ),
          memo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setMessage({ type: "success", text: `在庫登録しました（${data.created}拠点）` });
      setProductName("");
      setQuantities({});
      setMemo("");
      onSuccess();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "登録に失敗しました" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        商品が完成したら、拠点ごとの数量を入力してください。入力した拠点の分だけ在庫が追加されます。
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          商品名
          <Input value={productName} onChange={(e) => setProductName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          日時
          <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {config.locations.map((loc) => (
          <label key={loc} className="flex flex-col gap-1 text-sm">
            {loc} の数量
            <Input
              type="number"
              min={0}
              value={quantities[loc] ?? ""}
              onChange={(e) => setQuantities((q) => ({ ...q, [loc]: e.target.value }))}
              placeholder="0"
            />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        備考（任意）
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
      </label>
      {message && (
        <p className={`text-sm ${message.type === "error" ? "text-destructive" : "text-emerald-600"}`}>
          {message.text}
        </p>
      )}
      <Button type="submit" disabled={submitting} className="self-start">
        {submitting ? "登録中…" : "在庫登録"}
      </Button>
    </form>
  );
}
