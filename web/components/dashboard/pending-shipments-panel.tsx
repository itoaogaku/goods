"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusSelect } from "@/components/dashboard/status-select";
import { formatJPY, formatNumber } from "@/lib/utils";
import { LEDGER_CONFIG } from "@/lib/ledger";
import type { InventoryEvent, Ledger } from "@/lib/types";

interface PendingShipmentsPanelProps {
  ledger: Ledger;
  refreshKey: number;
  onChanged: () => void;
}

export function PendingShipmentsPanel({ ledger, refreshKey, onChanged }: PendingShipmentsPanelProps) {
  const config = LEDGER_CONFIG[ledger];
  const [records, setRecords] = useState<InventoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/${ledger}/pending-shipments`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { records: InventoryEvent[] } = await res.json();
        setRecords(data.records);
        setError(null);
      } catch (err) {
        console.error(err);
        setError("未発送一覧の取得に失敗しました");
      }
    }
    void load();
  }, [ledger, refreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">
          発送管理（未発送 {records ? records.length : "…"} 件）
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>取引ID</TableHead>
                <TableHead>注文日</TableHead>
                {config.locations.length > 1 && <TableHead>拠点</TableHead>}
                <TableHead>商品名</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">合計金額</TableHead>
                <TableHead>備考</TableHead>
                <TableHead>ステータス</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(records ?? []).map((record) => (
                <TableRow key={record.pageId}>
                  <TableCell className="font-mono text-xs">{record.transactionId}</TableCell>
                  <TableCell className="whitespace-nowrap">{record.occurredAt.slice(0, 10)}</TableCell>
                  {config.locations.length > 1 && <TableCell>{record.location}</TableCell>}
                  <TableCell className="max-w-48 truncate">{record.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(record.quantity)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatJPY(record.totalAmount)}
                  </TableCell>
                  <TableCell className="max-w-32 truncate text-muted-foreground">{record.memo}</TableCell>
                  <TableCell>
                    <StatusSelect ledger={ledger} pageId={record.pageId} status={record.status} onUpdated={onChanged} />
                  </TableCell>
                </TableRow>
              ))}
              {records && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    未発送の注文はありません
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
