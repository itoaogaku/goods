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
import type { InventoryEvent, Ledger, OrderStatus } from "@/lib/types";

interface PendingShipmentsPanelProps {
  ledger: Ledger;
  refreshKey: number;
  onChanged: () => void;
}

interface ShipmentGroup {
  transactionId: string;
  occurredAt: string;
  location: InventoryEvent["location"];
  lines: InventoryEvent[];
  memo: string;
  status: OrderStatus;
  totalAmount: number;
}

// 同じ取引ID（1回の注文）の商品明細が複数行に分かれている場合、発送管理
// では梱包・発送の単位である「注文」ごとに1行へまとめる。ステータスは
// 同じ注文の全明細で揃っているはず（Wix同期は注文単位で同じ値を書き込む）
// なので先頭行の値を代表として表示し、変更時は明細の全pageIdに反映する。
function groupByTransaction(records: InventoryEvent[]): ShipmentGroup[] {
  const groups = new Map<string, ShipmentGroup>();
  for (const r of records) {
    const g = groups.get(r.transactionId);
    if (g) {
      g.lines.push(r);
      g.totalAmount += r.totalAmount;
      if (r.occurredAt < g.occurredAt) g.occurredAt = r.occurredAt;
    } else {
      groups.set(r.transactionId, {
        transactionId: r.transactionId,
        occurredAt: r.occurredAt,
        location: r.location,
        lines: [r],
        memo: r.memo,
        status: r.status,
        totalAmount: r.totalAmount,
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export function PendingShipmentsPanel({ ledger, refreshKey, onChanged }: PendingShipmentsPanelProps) {
  const config = LEDGER_CONFIG[ledger];
  const [records, setRecords] = useState<InventoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = records ? groupByTransaction(records) : null;

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
          発送管理（未発送 {groups ? groups.length : "…"} 件）
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
                <TableHead>商品明細</TableHead>
                <TableHead className="text-right">合計金額</TableHead>
                <TableHead>備考</TableHead>
                <TableHead>ステータス</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(groups ?? []).map((group) => (
                <TableRow key={group.transactionId}>
                  <TableCell className="font-mono text-xs">{group.transactionId}</TableCell>
                  <TableCell className="whitespace-nowrap">{group.occurredAt.slice(0, 10)}</TableCell>
                  {config.locations.length > 1 && <TableCell>{group.location}</TableCell>}
                  <TableCell className="max-w-64">
                    <div className="flex flex-col gap-0.5">
                      {group.lines.map((line) => (
                        <div key={line.pageId} className="truncate">
                          {line.productName}
                          <span className="text-muted-foreground"> ×{formatNumber(line.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatJPY(group.totalAmount)}
                  </TableCell>
                  <TableCell className="max-w-32 truncate text-muted-foreground">{group.memo}</TableCell>
                  <TableCell>
                    <StatusSelect
                      ledger={ledger}
                      pageId={group.lines.map((line) => line.pageId)}
                      status={group.status}
                      onUpdated={onChanged}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {groups && groups.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={config.locations.length > 1 ? 7 : 6}
                    className="py-8 text-center text-muted-foreground"
                  >
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
