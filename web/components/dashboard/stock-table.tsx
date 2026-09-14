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
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";
import { LEDGER_CONFIG } from "@/lib/ledger";
import type { Ledger, StockBalanceEntry } from "@/lib/types";

interface StockTableProps {
  ledger: Ledger;
  refreshKey: number;
}

export function StockTable({ ledger, refreshKey }: StockTableProps) {
  const config = LEDGER_CONFIG[ledger];
  const [balances, setBalances] = useState<StockBalanceEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/${ledger}/stock`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { balances: StockBalanceEntry[] } = await res.json();
        setBalances(data.balances);
      } catch (err) {
        console.error(err);
        setError("在庫状況の取得に失敗しました");
      }
    }
    void load();
  }, [ledger, refreshKey]);

  // Pivot to one row per product with a column per location.
  const products = [...new Set((balances ?? []).map((b) => b.productName))].sort();
  const byProductLocation = new Map<string, number>();
  const purchasedByProduct = new Map<string, number>();
  for (const b of balances ?? []) {
    byProductLocation.set(`${b.productName}__${b.location}`, b.quantity);
    purchasedByProduct.set(b.productName, (purchasedByProduct.get(b.productName) ?? 0) + b.purchasedQuantity);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">現在庫</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>商品名</TableHead>
                <TableHead className="text-right">仕入れ数</TableHead>
                {config.locations.map((loc) => (
                  <TableHead key={loc} className="text-right">
                    {loc}
                  </TableHead>
                ))}
                {config.locations.length > 1 && <TableHead className="text-right">合計</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const total = config.locations.reduce(
                  (sum, loc) => sum + (byProductLocation.get(`${product}__${loc}`) ?? 0),
                  0
                );
                return (
                  <TableRow key={product}>
                    <TableCell className="max-w-56 truncate font-medium">{product}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatNumber(purchasedByProduct.get(product) ?? 0)}
                    </TableCell>
                    {config.locations.map((loc) => {
                      const qty = byProductLocation.get(`${product}__${loc}`) ?? 0;
                      return (
                        <TableCell key={loc} className="text-right tabular-nums">
                          {qty < 0 ? <Badge variant="destructive">{formatNumber(qty)}</Badge> : formatNumber(qty)}
                        </TableCell>
                      );
                    })}
                    {config.locations.length > 1 && (
                      <TableCell className="text-right font-medium tabular-nums">{formatNumber(total)}</TableCell>
                    )}
                  </TableRow>
                );
              })}
              {balances && products.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={config.locations.length + (config.locations.length > 1 ? 3 : 2)}
                    className="py-8 text-center text-muted-foreground"
                  >
                    在庫データがありません。「在庫登録」から入庫を記録してください
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
