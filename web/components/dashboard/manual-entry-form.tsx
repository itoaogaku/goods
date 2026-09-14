"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductNameInput } from "@/components/dashboard/product-name-input";
import { LEDGER_CONFIG, MANUAL_ENTRY_EVENT_TYPES } from "@/lib/ledger";
import { useProductPrices } from "@/lib/use-product-prices";
import { formatJPY } from "@/lib/utils";
import type { EventType, Ledger, Location, OrderStatus, ProductPriceEntry } from "@/lib/types";

const STATUS_OPTIONS: OrderStatus[] = ["未発送", "発送済", "キャンセル", "返金"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Which 料金表一覧 price column corresponds to each sale-like 種別, for
// auto-filling 単価 once 商品名 and 種別 are both chosen. null means "don't
// auto-fill" (棚卸調整 isn't a sale, and 卸し on 陸上部 has its own 定価 ->
// 90%計算 flow — see isCoopWholesale below).
function priceForEventType(entry: ProductPriceEntry, type: EventType): number | null {
  switch (type) {
    case "通常販売":
      return entry.listPrice;
    case "関係者価格販売":
      return entry.insiderPrice;
    case "卸し":
      return entry.wholesalePrice;
    case "プレゼント":
      return 0;
    default:
      return null;
  }
}

interface ManualEntryFormProps {
  ledger: Ledger;
  onSuccess: () => void;
}

export function ManualEntryForm({ ledger, onSuccess }: ManualEntryFormProps) {
  const config = LEDGER_CONFIG[ledger];

  const [productName, setProductName] = useState("");
  const [occurredAt, setOccurredAt] = useState(today());
  const [location, setLocation] = useState<Location>(config.locations[0]);
  const [eventType, setEventType] = useState<EventType>("通常販売");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");
  const [listPrice, setListPrice] = useState("");
  const [status, setStatus] = useState<OrderStatus>("発送済");
  const [customerName, setCustomerName] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isAdjustment = eventType === "棚卸調整";
  const needsDestinationMemo = eventType === "卸し" || eventType === "プレゼント";
  // 陸上部の「卸し」は基本的に購買会への販売で、購買会が10%のマージンを
  // 引いた金額が振り込まれる。定価を入力すれば自動でその金額を計算する。
  const isCoopWholesale = ledger === "trackteam" && eventType === "卸し";
  const coopUnitPrice = listPrice === "" ? 0 : Math.round(Number(listPrice) * 0.9);
  const effectiveUnitPrice = isCoopWholesale ? coopUnitPrice : Number(unitPrice) || 0;
  const totalAmount = (Number(quantity) || 0) * effectiveUnitPrice;

  // Adjusting state during render (not in an effect) when 商品名/種別
  // change, per https://react.dev/learn/you-might-not-need-an-effect —
  // this re-derives 単価 exactly when either input changes, while still
  // letting the user freely edit it afterward without it snapping back.
  const prices = useProductPrices();
  const [lastAutoFillKey, setLastAutoFillKey] = useState("");
  const autoFillKey = `${productName}|||${eventType}`;
  if (autoFillKey !== lastAutoFillKey) {
    setLastAutoFillKey(autoFillKey);
    if (!isCoopWholesale) {
      const entry = prices.find((p) => p.productName === productName);
      const autoPrice = entry ? priceForEventType(entry, eventType) : null;
      if (autoPrice !== null) setUnitPrice(String(autoPrice));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/${ledger}/manual-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          occurredAt,
          location,
          eventType,
          quantity: Number(quantity),
          unitPrice: effectiveUnitPrice,
          status,
          customerName,
          memo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setMessage({ type: "success", text: "記録しました" });
      setProductName("");
      setQuantity("");
      setUnitPrice("0");
      setListPrice("");
      setCustomerName("");
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
        手入力での販売・関係者価格販売・プレゼント・卸し・棚卸調整はここから記録します。
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
        <label className="flex flex-col gap-1 text-sm">
          種別
          <Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MANUAL_ENTRY_EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
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
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          数量{isAdjustment && "（減らす場合はマイナス）"}
          <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </label>
        {isCoopWholesale ? (
          <label className="flex flex-col gap-1 text-sm">
            定価（購買会での販売価格）
            <Input type="number" min={0} value={listPrice} onChange={(e) => setListPrice(e.target.value)} />
            <span className="text-xs text-muted-foreground">
              購買会の10%マージン差引後、陸上部の単価は ¥{coopUnitPrice.toLocaleString("ja-JP")} として記録されます
            </span>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            単価
            <Input type="number" min={0} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            <span className="text-xs text-muted-foreground">
              商品名・種別を選ぶと料金表から自動入力されます（必要に応じて変更できます）
            </span>
          </label>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          顧客名（任意）
          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ステータス
          <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
            <SelectTrigger>
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
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          備考{needsDestinationMemo && "（卸し先・贈呈先など）"}
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        合計金額（単価×数量）: <span className="font-medium text-foreground">{formatJPY(totalAmount)}</span>
      </p>
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
