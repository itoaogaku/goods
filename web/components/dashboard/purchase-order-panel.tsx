"use client";

import { Fragment, useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatJPY, formatNumber } from "@/lib/utils";
import { LEDGER_CONFIG, OPEN_PO_STATUSES } from "@/lib/ledger";
import type { InventoryEvent, Ledger, Location, PurchaseOrderStatus } from "@/lib/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const PO_STATUS_VARIANT: Record<PurchaseOrderStatus, "warning" | "success" | "secondary" | "destructive"> = {
  発注済み: "warning",
  一部納品: "warning",
  納品完了: "success",
  キャンセル: "destructive",
};

interface PurchaseOrderPanelProps {
  ledger: Ledger;
  refreshKey: number;
  onChanged: () => void;
}

export function PurchaseOrderPanel({ ledger, refreshKey, onChanged }: PurchaseOrderPanelProps) {
  const config = LEDGER_CONFIG[ledger];
  const [orders, setOrders] = useState<InventoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [receivingPageId, setReceivingPageId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/${ledger}/purchase-orders`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { records: InventoryEvent[] } = await res.json();
        setOrders(data.records);
        setError(null);
      } catch (err) {
        console.error(err);
        setError("発注一覧の取得に失敗しました");
      }
    }
    void load();
  }, [ledger, refreshKey]);

  const visible = (orders ?? []).filter(
    (o) => showAll || (o.poStatus && OPEN_PO_STATUSES.includes(o.poStatus))
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold text-foreground">発注一覧</CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "納品待ちのみ表示" : "すべて表示"}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>発注日</TableHead>
                <TableHead>商品名</TableHead>
                <TableHead className="text-right">発注数量</TableHead>
                <TableHead className="text-right">受領済み</TableHead>
                <TableHead className="text-right">仕入単価</TableHead>
                <TableHead>備考</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((po) => {
                const remaining = po.quantity - po.receivedQuantity;
                const isOpen = po.poStatus ? OPEN_PO_STATUSES.includes(po.poStatus) : true;
                return (
                  <Fragment key={po.pageId}>
                    <TableRow>
                      <TableCell className="whitespace-nowrap">{po.occurredAt.slice(0, 10)}</TableCell>
                      <TableCell className="max-w-40 truncate">{po.productName}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(po.quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(po.receivedQuantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatJPY(po.unitPrice)}</TableCell>
                      <TableCell className="max-w-32 truncate text-muted-foreground">{po.memo}</TableCell>
                      <TableCell>
                        {po.poStatus && <Badge variant={PO_STATUS_VARIANT[po.poStatus]}>{po.poStatus}</Badge>}
                      </TableCell>
                      <TableCell>
                        {isOpen && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setReceivingPageId(receivingPageId === po.pageId ? null : po.pageId)
                            }
                          >
                            納品登録
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {receivingPageId === po.pageId && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/30">
                          <ReceiveForm
                            ledger={ledger}
                            pageId={po.pageId}
                            remaining={remaining}
                            locations={config.locations}
                            defaultLocation={po.location}
                            onDone={() => {
                              setReceivingPageId(null);
                              onChanged();
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {orders && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    {showAll ? "発注データがありません" : "納品待ちの発注はありません"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface ReceiveFormProps {
  ledger: Ledger;
  pageId: string;
  remaining: number;
  locations: Location[];
  defaultLocation: Location;
  onDone: () => void;
}

function ReceiveForm({ ledger, pageId, remaining, locations, defaultLocation, onDone }: ReceiveFormProps) {
  const [occurredAt, setOccurredAt] = useState(today());
  const [receivedQuantity, setReceivedQuantity] = useState(String(remaining));
  const [location, setLocation] = useState<Location>(defaultLocation);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/${ledger}/purchase-order/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, occurredAt, receivedQuantity: Number(receivedQuantity), location }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "納品登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 py-2">
      <label className="flex flex-col gap-1 text-xs">
        納品日
        <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className="w-36" />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        納品数量（残り{formatNumber(remaining)}）
        <Input
          type="number"
          min={1}
          max={remaining}
          value={receivedQuantity}
          onChange={(e) => setReceivedQuantity(e.target.value)}
          className="w-28"
        />
      </label>
      {locations.length > 1 && (
        <label className="flex flex-col gap-1 text-xs">
          納品先拠点
          <Select value={location} onValueChange={(v) => setLocation(v as Location)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locations.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      )}
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? "登録中…" : "在庫に反映する"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
