"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductNameInput } from "@/components/dashboard/product-name-input";
import { LEDGER_CONFIG } from "@/lib/ledger";
import { useProductPrices } from "@/lib/use-product-prices";
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
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const totalQuantity = Object.values(quantities).reduce((sum, v) => sum + (Number(v) || 0), 0);

  // Adjusting state during render (not in an effect) when 商品名/数量が
  // 変わったタイミングで、料金表一覧の原価×合計数量を仕入れ金額に自動
  // 反映する — manual-entry-form.tsxの単価自動入力と同じパターン。原価が
  // 未入力の商品や数量0のときは上書きせず、それまでの入力値を保つ。
  const prices = useProductPrices();
  const [lastAutoFillKey, setLastAutoFillKey] = useState("");
  const autoFillKey = `${productName}|||${totalQuantity}`;
  if (autoFillKey !== lastAutoFillKey) {
    setLastAutoFillKey(autoFillKey);
    const entry = prices.find((p) => p.productName === productName);
    if (entry && entry.costPrice !== null && totalQuantity > 0) {
      setPurchaseAmount(String(entry.costPrice * totalQuantity));
    }
  }

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
          purchaseAmount: purchaseAmount === "" ? undefined : Number(purchaseAmount),
          memo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setMessage({ type: "success", text: `在庫登録しました（${data.created}拠点）` });
      setProductName("");
      setQuantities({});
      setPurchaseAmount("");
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
        商品が完成したら、拠点ごとの数量を入力してください。入力した拠点の分だけ在庫が追加されます。仕入れ金額（料金表の原価×合計数量が自動入力されます）は、経費として自動で記録されます（年間の売上・経費の集計に反映されます）。
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          仕入れ金額（合計・任意）
          <Input
            type="number"
            min={0}
            value={purchaseAmount}
            onChange={(e) => setPurchaseAmount(e.target.value)}
            placeholder="経費として自動記録されます"
          />
          <span className="text-xs text-muted-foreground">
            商品名・数量を入力すると、料金表の原価×合計数量が自動入力されます（必要に応じて変更できます）
          </span>
        </label>
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
        {submitting ? "登録中…" : "在庫登録"}
      </Button>
    </form>
  );
}
