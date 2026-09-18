"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatJPY } from "@/lib/utils";
import type { InventoryEvent, Ledger } from "@/lib/types";

interface EditEventDialogProps {
  ledger: Ledger;
  event: InventoryEvent;
  /** Called after a successful save or revert, so the caller can refetch. */
  onSaved?: () => void;
}

export function EditEventDialog({ ledger, event, onSaved }: EditEventDialogProps) {
  const [open, setOpen] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  const [productName, setProductName] = useState(event.productName);
  const [quantity, setQuantity] = useState(String(event.quantity));
  const [unitPrice, setUnitPrice] = useState(String(event.unitPrice));
  const [memo, setMemo] = useState(event.memo);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ダイアログを開くたびに、フォームの中身をその時点の最新の値でリセットする
  // (React.dev "You Might Not Need an Effect" のパターン — useEffectではなく
  // レンダー中の調整。records が再取得されても開いていない間はローカル状態が
  // 古いままになるのを防ぐ)。
  if (open && !lastOpen) {
    setLastOpen(true);
    setProductName(event.productName);
    setQuantity(String(event.quantity));
    setUnitPrice(String(event.unitPrice));
    setMemo(event.memo);
    setError(null);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  async function handleSave() {
    const quantityNum = Number(quantity);
    const unitPriceNum = Number(unitPrice);
    if (!productName.trim()) {
      setError("商品名を入力してください");
      return;
    }
    if (!Number.isFinite(quantityNum) || quantityNum < 0) {
      setError("数量が不正です");
      return;
    }
    if (!Number.isFinite(unitPriceNum) || unitPriceNum < 0) {
      setError("単価が不正です");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/${ledger}/event/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: event.pageId,
          productName: productName.trim(),
          quantity: quantityNum,
          unitPrice: unitPriceNum,
          memo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      setOpen(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevert() {
    setReverting(true);
    setError(null);
    try {
      const res = await fetch(`/api/${ledger}/event/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: event.pageId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "元に戻す処理に失敗しました");
      setOpen(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "元に戻す処理に失敗しました");
    } finally {
      setReverting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-7 w-7" title="この取引を編集">
          <Pencil className="h-3.5 w-3.5" />
          <span className="sr-only">編集</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>取引を編集</DialogTitle>
          <DialogDescription>
            取引ID {event.transactionId} の内容を修正します。サイズ変更・個数変更など、キャンセル以外の注文変更に使ってください。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {event.originalValues && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              編集前: {event.originalValues.productName} ／ 数量 {event.originalValues.quantity} ／ 単価{" "}
              {formatJPY(event.originalValues.unitPrice)}
            </p>
          )}
          <label className="flex flex-col gap-1 text-sm text-foreground">
            商品名
            <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-foreground">
              数量
              <Input
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              単価
              <Input
                type="number"
                min="0"
                step="1"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm text-foreground">
            備考
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <p className="text-xs text-muted-foreground">合計金額は自動的に「数量×単価」で再計算されます。</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRevert}
            disabled={!event.originalValues || saving || reverting}
            className="text-muted-foreground"
          >
            {reverting ? "元に戻しています…" : "編集前の内容に戻す"}
          </Button>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving || reverting}>
              キャンセル
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || reverting}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
