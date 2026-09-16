"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductNameInput } from "@/components/dashboard/product-name-input";
import { LEDGER_CONFIG, manualEntryEventTypes } from "@/lib/ledger";
import { useProductPrices } from "@/lib/use-product-prices";
import { formatJPY } from "@/lib/utils";
import type { EventType, Ledger, Location, OrderStatus, ProductPriceEntry } from "@/lib/types";

const STATUS_OPTIONS: OrderStatus[] = ["未発送", "発送済", "キャンセル", "返金"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Which 料金表一覧 price column corresponds to each sale-like 種別, for
// auto-filling 単価 once 商品名 and 種別 are both chosen. null means "don't
// auto-fill" (棚卸調整 isn't a sale).
function priceForEventType(entry: ProductPriceEntry, type: EventType): number | null {
  switch (type) {
    case "通常販売":
      return entry.listPrice;
    case "関係者価格販売":
      return entry.insiderPrice;
    case "陸上部卸し":
      return entry.wholesalePrice;
    case "購買会卸し":
      return entry.coopWholesalePrice;
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
  const [status, setStatus] = useState<OrderStatus>("発送済");
  const [customerName, setCustomerName] = useState("");
  const [memo, setMemo] = useState("");
  // ACC→陸上部の自動連携で、陸上部側の入庫（と紐づく経費）をどちらの
  // 拠点に記録するか。通常は陸上部本体の在庫になるが、購買会へ直送する
  // 場合はここで「購買会」を選べば、拠点間移動を別途記録する必要がない。
  const [trackTeamDestination, setTrackTeamDestination] = useState<Location>(LEDGER_CONFIG.trackteam.locations[0]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isAdjustment = eventType === "棚卸調整";
  const isAccToTrackTeamWholesale = ledger === "acc" && eventType === "陸上部卸し";
  const isCoopSale = ledger === "trackteam" && eventType === "購買会卸し";
  const needsDestinationMemo = eventType === "陸上部卸し" || eventType === "プレゼント";
  const effectiveUnitPrice = Number(unitPrice) || 0;
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
    const entry = prices.find((p) => p.productName === productName);
    const autoPrice = entry ? priceForEventType(entry, eventType) : null;
    if (autoPrice !== null) setUnitPrice(String(autoPrice));
  }

  // 購買会卸し（購買会での実売報告）は必ず拠点=購買会で記録するべきなので、
  // 種別をそれに切り替えたタイミングで拠点も合わせて自動選択する（他の
  // 種別へ切り替えたときは拠点はそのまま、ユーザーが選んだ値を保つ）。
  const [lastLocationAutoKey, setLastLocationAutoKey] = useState(eventType);
  if (eventType !== lastLocationAutoKey) {
    setLastLocationAutoKey(eventType);
    if (isCoopSale && config.locations.includes("購買会")) setLocation("購買会");
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
          trackTeamLocation: isAccToTrackTeamWholesale ? trackTeamDestination : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setMessage({
        type: "success",
        text: data.warning ? `記録しました（${data.warning}）` : "記録しました",
      });
      setProductName("");
      setQuantity("");
      setUnitPrice("0");
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
              {manualEntryEventTypes(ledger).map((t) => (
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
        <label className="flex flex-col gap-1 text-sm">
          単価
          <Input type="number" min={0} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          <span className="text-xs text-muted-foreground">
            {isCoopSale
              ? "商品名を選ぶと料金表の購買会卸値（定価の10%オフ）が自動入力されます（必要に応じて変更できます）"
              : "商品名・種別を選ぶと料金表から自動入力されます（必要に応じて変更できます）"}
          </span>
        </label>
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
      {isAccToTrackTeamWholesale && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm sm:w-1/2">
            陸上部側の入庫先
            <Select value={trackTeamDestination} onValueChange={(v) => setTrackTeamDestination(v as Location)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEDGER_CONFIG.trackteam.locations.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <p className="text-sm text-muted-foreground">
            記録すると、陸上部側にも同じ商品・数量の在庫登録（入庫）と、支払金額分の経費が自動で記録されます。陸上部側で別途入力する必要はありません。購買会へ直接送る場合は、入庫先を「購買会」にしてください（拠点間移動を別途記録する必要がなくなります）。
          </p>
        </div>
      )}
      {isCoopSale && (
        <p className="text-sm text-muted-foreground">
          購買会に置いている在庫の中から、実際に売れた分を月末の報告に合わせて記録してください（拠点は「購買会」のまま）。購買会の在庫がその数だけ減り、単価×数量が陸上部の売上として計上されます。
        </p>
      )}
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
