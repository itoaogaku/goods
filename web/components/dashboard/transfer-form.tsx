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

interface TransferFormProps {
  ledger: Ledger;
  onSuccess: () => void;
}

export function TransferForm({ ledger, onSuccess }: TransferFormProps) {
  const config = LEDGER_CONFIG[ledger];

  const [productName, setProductName] = useState("");
  const [occurredAt, setOccurredAt] = useState(today());
  const [from, setFrom] = useState<Location>(config.locations[0]);
  const [to, setTo] = useState<Location>(config.locations[1] ?? config.locations[0]);
  const [quantity, setQuantity] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/${ledger}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, occurredAt, from, to, quantity: Number(quantity), memo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setMessage({ type: "success", text: "拠点間移動を登録しました" });
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
      <p className="text-sm text-muted-foreground">拠点間で在庫を移動した際に記録してください。</p>
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          移動元
          <Select value={from} onValueChange={(v) => setFrom(v as Location)}>
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
        <label className="flex flex-col gap-1 text-sm">
          移動先
          <Select value={to} onValueChange={(v) => setTo(v as Location)}>
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
        <label className="flex flex-col gap-1 text-sm">
          数量
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </label>
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
        {submitting ? "登録中…" : "移動を登録"}
      </Button>
    </form>
  );
}
