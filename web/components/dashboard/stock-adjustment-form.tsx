"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductNameInput } from "@/components/dashboard/product-name-input";
import { LEDGER_CONFIG } from "@/lib/ledger";
import type { Ledger, Location } from "@/lib/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface StockAdjustmentFormProps {
  ledger: Ledger;
  onSuccess: () => void;
}

export function StockAdjustmentForm({ ledger, onSuccess }: StockAdjustmentFormProps) {
  const config = LEDGER_CONFIG[ledger];

  const [productName, setProductName] = useState("");
  const [occurredAt, setOccurredAt] = useState(today());
  const [location, setLocation] = useState<Location>(config.locations[0]);
  const [quantity, setQuantity] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/${ledger}/stock-adjustment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          occurredAt,
          location,
          quantity: Number(quantity),
          memo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setMessage({ type: "success", text: "記録しました" });
      setProductName("");
      setQuantity("");
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
        売上には影響させずに、在庫数をプラス・マイナスで記録したいときはここから登録します。ここで登録した増減は水上村・町田・合計の実際の在庫数には反映されず、現在庫の「在庫調整」列に別枠で累計表示されます。
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          商品名
          <ProductNameInput value={productName} onChange={setProductName} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          日時
          <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {config.locations.length > 1 && (
          <label className="flex flex-col gap-1 text-sm">
            拠点
            <Select value={location} onValueChange={(v) => setLocation(v as Location)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.locations.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          増減数（減らす場合はマイナス）
          <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          備考（任意）
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
      </div>
      {message && (
        <p className={`text-sm ${message.type === "error" ? "text-destructive" : "text-emerald-600"}`}>
          {message.text}
        </p>
      )}
      <Button type="submit" disabled={submitting} className="self-start">
        {submitting ? "登録中…" : "記録する"}
      </Button>
    </form>
  );
}
