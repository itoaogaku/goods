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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJPY } from "@/lib/utils";
import type { InventoryEvent, Ledger } from "@/lib/types";

const DEFAULT_VISIBLE_COUNT = 15;

interface ExpensePanelProps {
  ledger: Ledger;
  refreshKey: number;
}

// The 在庫登録 form's 仕入れ金額, the 経費登録 tab, and ACC→陸上部卸しの
// 自動記録(陸上部側) all write 種別=経費 — the first two are identified by
// the transactionId prefix of whichever route created them (see
// /api/[ledger]/stock-in and /api/[ledger]/expense), the last by its memo
// (see /api/[ledger]/manual-entry). Used here only to label a row, not to
// change how it's counted.
function isProcurement(record: Pick<InventoryEvent, "transactionId" | "memo">): boolean {
  return record.transactionId.startsWith("STOCK-") || record.memo.includes("ACCからの仕入れ");
}

export function ExpensePanel({ ledger, refreshKey }: ExpensePanelProps) {
  const [records, setRecords] = useState<InventoryEvent[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Adjusting state during render (not in an effect) when the ledger
  // changes, per https://react.dev/learn/you-might-not-need-an-effect —
  // collapses back to the default 15-row view when switching ledgers.
  const [lastLedger, setLastLedger] = useState(ledger);
  if (ledger !== lastLedger) {
    setLastLedger(ledger);
    setShowAll(false);
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/${ledger}/expenses`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
        setRecords(body.records);
        setTotal(body.total);
        setError(null);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "経費一覧の取得に失敗しました");
      }
    }
    void load();
  }, [ledger, refreshKey]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <CardTitle className="text-base font-semibold text-foreground">
          経費一覧（{records ? records.length : "…"} 件）
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          合計 <span className="font-semibold text-foreground">{formatJPY(total)}</span>
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日時</TableHead>
                <TableHead>区分</TableHead>
                <TableHead>内容</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead>備考</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(showAll ? (records ?? []) : (records ?? []).slice(0, DEFAULT_VISIBLE_COUNT)).map((record) => (
                <TableRow key={record.pageId}>
                  <TableCell className="whitespace-nowrap">{record.occurredAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    <Badge variant={isProcurement(record) ? "success" : "secondary"}>
                      {isProcurement(record) ? "仕入れ" : "その他"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{record.productName}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatJPY(record.totalAmount)}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">{record.memo}</TableCell>
                </TableRow>
              ))}
              {records && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    経費の記録はまだありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {records && records.length > DEFAULT_VISIBLE_COUNT && (
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "最新15件のみ表示" : `全データを表示（${records.length}件）`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
