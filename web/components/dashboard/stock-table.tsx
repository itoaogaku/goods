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
import { Button } from "@/components/ui/button";
import { compareProductNames, formatNumber } from "@/lib/utils";
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
  const [showArchived, setShowArchived] = useState(false);

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
  const byProductLocation = new Map<string, number>();
  const purchasedByProduct = new Map<string, number>();
  const adjustmentByProduct = new Map<string, number>();
  const firstStockInByProduct = new Map<string, string | null>();
  for (const b of balances ?? []) {
    byProductLocation.set(`${b.productName}__${b.location}`, b.quantity);
    purchasedByProduct.set(b.productName, (purchasedByProduct.get(b.productName) ?? 0) + b.purchasedQuantity);
    adjustmentByProduct.set(b.productName, (adjustmentByProduct.get(b.productName) ?? 0) + b.adjustmentQuantity);
    firstStockInByProduct.set(b.productName, b.firstStockInDate);
  }

  // Same ordering as 顧客別集計: products with a first 在庫追加 come first,
  // oldest first, ties broken by compareProductNames (so XL/L/M/S/XS size
  // variants stay grouped); products never stocked in fall to the end.
  function sortProducts(names: string[]): string[] {
    return names.sort((a, b) => {
      const dateA = firstStockInByProduct.get(a);
      const dateB = firstStockInByProduct.get(b);
      if (dateA && dateB) return dateA.localeCompare(dateB) || compareProductNames(a, b);
      if (dateA) return -1;
      if (dateB) return 1;
      return compareProductNames(a, b);
    });
  }

  // 全拠点で在庫が0になった商品は「アーカイブ」として下部にまとめ、
  // デフォルトでは折りたたんでおく(売り切れて動きの無い商品で一覧が
  // 埋まるのを防ぐため)。マイナス在庫(売り越し)は要対応事項なので
  // アーカイブせず通常表示に残す。
  const allProducts = [...new Set((balances ?? []).map((b) => b.productName))];
  const isArchived = (product: string) =>
    config.locations.every((loc) => (byProductLocation.get(`${product}__${loc}`) ?? 0) === 0);
  const products = sortProducts(allProducts.filter((p) => !isArchived(p)));
  const archivedProducts = sortProducts(allProducts.filter(isArchived));
  const colSpan = config.locations.length + (config.locations.length > 1 ? 4 : 3);

  function renderProductRow(product: string) {
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
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {(() => {
            const adj = adjustmentByProduct.get(product) ?? 0;
            if (adj === 0) return formatNumber(adj);
            return adj > 0 ? `+${formatNumber(adj)}` : formatNumber(adj);
          })()}
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
                <TableHead className="text-right">棚卸調整</TableHead>
                {config.locations.map((loc) => (
                  <TableHead key={loc} className="text-right">
                    {loc}
                  </TableHead>
                ))}
                {config.locations.length > 1 && <TableHead className="text-right">合計</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map(renderProductRow)}
              {balances && products.length === 0 && archivedProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                    在庫データがありません。「在庫登録」から入庫を記録してください
                  </TableCell>
                </TableRow>
              )}
              {archivedProducts.length > 0 && (
                <TableRow>
                  <TableCell colSpan={colSpan} className="bg-muted/30 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowArchived((v) => !v)}
                      className="text-muted-foreground"
                    >
                      {showArchived
                        ? "アーカイブを隠す"
                        : `アーカイブを表示（全拠点で在庫0の${archivedProducts.length}件）`}
                    </Button>
                  </TableCell>
                </TableRow>
              )}
              {showArchived && archivedProducts.map(renderProductRow)}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
