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
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductSyncButton } from "@/components/dashboard/product-sync-button";
import { formatJPY } from "@/lib/utils";
import type { ProductPriceEntry } from "@/lib/types";

export function PriceListTable() {
  const [products, setProducts] = useState<ProductPriceEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function fetchProducts(): Promise<ProductPriceEntry[]> {
    const res = await fetch("/api/products/list");
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
    return body.products;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setProducts(await fetchProducts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "料金表の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchProducts();
        if (!cancelled) setProducts(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "料金表の取得に失敗しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePriceChange(
    pageId: string,
    field: "costPrice" | "insiderPrice" | "wholesalePrice",
    rawValue: string
  ) {
    const value = rawValue === "" ? null : Number(rawValue);
    setProducts((prev) => prev.map((p) => (p.pageId === pageId ? { ...p, [field]: value } : p)));
  }

  async function handlePriceBlur(pageId: string) {
    const product = products.find((p) => p.pageId === pageId);
    if (!product) return;

    setSavingId(pageId);
    try {
      const res = await fetch("/api/products/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId,
          costPrice: product.costPrice,
          insiderPrice: product.insiderPrice,
          wholesalePrice: product.wholesalePrice,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "価格の保存に失敗しました");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base font-semibold text-foreground">料金表一覧</CardTitle>
        <ProductSyncButton onSynced={load} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          商品名と定価はWixの商品登録から自動で反映されます。原価・関係者価格・陸上部卸値はこの画面で入力してください（入力欄から離れると自動保存されます）。
        </p>

        {loading && <p className="text-sm text-muted-foreground">読み込み中…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品名</TableHead>
                  <TableHead className="text-right">定価</TableHead>
                  <TableHead className="text-right">原価</TableHead>
                  <TableHead className="text-right">関係者価格</TableHead>
                  <TableHead className="text-right">陸上部卸値</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.pageId}>
                    <TableCell className="max-w-64 truncate">{product.productName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatJPY(product.listPrice)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="ml-auto w-28 text-right"
                        value={product.costPrice ?? ""}
                        disabled={savingId === product.pageId}
                        onChange={(e) => handlePriceChange(product.pageId, "costPrice", e.target.value)}
                        onBlur={() => handlePriceBlur(product.pageId)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="ml-auto w-28 text-right"
                        value={product.insiderPrice ?? ""}
                        disabled={savingId === product.pageId}
                        onChange={(e) => handlePriceChange(product.pageId, "insiderPrice", e.target.value)}
                        onBlur={() => handlePriceBlur(product.pageId)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="ml-auto w-28 text-right"
                        value={product.wholesalePrice ?? ""}
                        disabled={savingId === product.pageId}
                        onChange={(e) => handlePriceChange(product.pageId, "wholesalePrice", e.target.value)}
                        onBlur={() => handlePriceBlur(product.pageId)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {products.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      商品がありません。「今すぐWixと同期」を押してください。
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
