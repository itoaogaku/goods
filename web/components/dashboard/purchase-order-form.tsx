"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEDGER_CONFIG } from "@/lib/ledger";
import type { Ledger, Location } from "@/lib/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface PurchaseOrderFormProps {
  ledger: Ledger;
  onSuccess: () => void;
}

export function PurchaseOrderForm({ ledger, onSuccess }: PurchaseOrderFormProps) {
  const config = LEDGER_CONFIG[ledger];

  const [productName, setProductName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [occurredAt, setOccurredAt] = useState(today());
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [location, setLocation] = useState<Location>(config.locations[0]);
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/${ledger}/purchase-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          supplier,
          occurredAt,
          expectedDeliveryDate: expectedDeliveryDate || undefined,
          location,
          quantity: Number(quantity),
          unitPrice: Number(unitPrice) || 0,
          memo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setMessage({ type: "success", text: "発注を登録しました" });
      setProductName("");
      setSupplier("");
      setExpectedDeliveryDate("");
      setQuantity("");
      setUnitPrice("");
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
        仕入先に発注した時点で記録します。この時点では在庫は増えません。「発注一覧」から納品を登録すると在庫（入庫）に反映されます。
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          商品名
          <Input value={productName} onChange={(e) => setProductName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          仕入先
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} required />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          発注日
          <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          納品予定日（任意）
          <Input
            type="date"
            value={expectedDeliveryDate}
            onChange={(e) => setExpectedDeliveryDate(e.target.value)}
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          発注数量
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          仕入単価
          <Input type="number" min={0} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
        </label>
        {config.locations.length > 1 && (
          <label className="flex flex-col gap-1 text-sm">
            納品予定拠点
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
        {submitting ? "登録中…" : "発注を登録"}
      </Button>
    </form>
  );
}
