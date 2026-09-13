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
import { formatJPY, formatNumber } from "@/lib/utils";
import type { CustomerMatrixResponse, Ledger } from "@/lib/types";

interface CustomerMatrixTableProps {
  ledger: Ledger;
}

export function CustomerMatrixTable({ ledger }: CustomerMatrixTableProps) {
  const [data, setData] = useState<CustomerMatrixResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/${ledger}/customer-matrix`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "顧客別集計の取得に失敗しました");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ledger]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">顧客別・商品別集計</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          注文（取引ID）ごとに、どの商品を何点購入したかを一覧にしています。横にスクロールすると全商品を確認できます。
        </p>

        {loading && <p className="text-sm text-muted-foreground">読み込み中…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {data && (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-background">取引ID</TableHead>
                  <TableHead className="sticky left-0 z-10 bg-background">名前</TableHead>
                  <TableHead className="whitespace-nowrap">注文日</TableHead>
                  {data.columns.map((col) => (
                    <TableHead key={col} className="max-w-24 truncate text-right" title={col}>
                      {col}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">商品売上</TableHead>
                  <TableHead className="text-right">送料</TableHead>
                  <TableHead className="text-right">売上合計</TableHead>
                  <TableHead>備考</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.transactionId}>
                    <TableCell className="font-mono text-xs">{row.transactionId}</TableCell>
                    <TableCell className="max-w-32 truncate">{row.customerName || "―"}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.orderDate.slice(0, 10)}</TableCell>
                    {data.columns.map((col) => (
                      <TableCell key={col} className="text-right tabular-nums">
                        {row.products[col] ? formatNumber(row.products[col]) : ""}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{formatJPY(row.productRevenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatJPY(row.shippingRevenue)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatJPY(row.total)}</TableCell>
                    <TableCell className="max-w-32 truncate text-muted-foreground">{row.memo}</TableCell>
                  </TableRow>
                ))}
                {!loading && data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={data.columns.length + 7} className="py-8 text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
