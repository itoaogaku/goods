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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductSyncButton } from "@/components/dashboard/product-sync-button";
import { formatJPY } from "@/lib/utils";
import type { ProductPriceEntry } from "@/lib/types";

export function PriceListTable() {
  const [products, setProducts] = useState<ProductPriceEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  // Price cells are read-only by default and only become editable after
  // pressing 編集する — a plain always-editable number input is too easy to
  // bump by accident while scrolling/tapping on a phone.
  const [editing, setEditing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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
    field: "costPrice" | "insiderPrice" | "wholesalePrice" | "coopWholesalePrice",
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
          coopWholesalePrice: product.coopWholesalePrice,
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

  async function handleBackfillWholesale() {
    setBackfilling(true);
    setBackfillMessage(null);
    try {
      const res = await fetch("/api/products/backfill-wholesale-price", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      setBackfillMessage(`${body.filled}件の陸上部卸値・購買会卸値の空欄を入力しました`);
      await load();
    } catch (err) {
      setBackfillMessage(err instanceof Error ? err.message : "一括入力に失敗しました");
    } finally {
      setBackfilling(false);
    }
  }

  // 原価率 = 原価 ÷ 定価。原価が未入力、または定価が0円の商品では計算できない。
  function costRatioLabel(product: ProductPriceEntry): string {
    if (product.costPrice === null || product.listPrice <= 0) return "―";
    return `${((product.costPrice / product.listPrice) * 100).toFixed(1)}%`;
  }

  function renderPriceCell(
    product: ProductPriceEntry,
    field: "costPrice" | "insiderPrice" | "wholesalePrice" | "coopWholesalePrice"
  ) {
    if (!editing) {
      const value = product[field];
      return <span className="tabular-nums">{value === null ? "―" : formatJPY(value)}</span>;
    }
    return (
      <Input
        type="number"
        className="ml-auto w-28 text-right"
        value={product[field] ?? ""}
        disabled={savingId === product.pageId}
        onChange={(e) => handlePriceChange(product.pageId, field, e.target.value)}
        onBlur={() => handlePriceBlur(product.pageId)}
      />
    );
  }

  function renderProductRow(product: ProductPriceEntry) {
    return (
      <TableRow key={product.pageId}>
        <TableCell className="max-w-64 truncate">{product.productName}</TableCell>
        <TableCell className="text-right tabular-nums">{formatJPY(product.listPrice)}</TableCell>
        <TableCell className="text-right">{renderPriceCell(product, "costPrice")}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {costRatioLabel(product)}
        </TableCell>
        <TableCell className="text-right">{renderPriceCell(product, "insiderPrice")}</TableCell>
        <TableCell className="text-right">{renderPriceCell(product, "wholesalePrice")}</TableCell>
        <TableCell className="text-right">{renderPriceCell(product, "coopWholesalePrice")}</TableCell>
      </TableRow>
    );
  }

  // ACC・陸上部の全拠点合計で在庫が0になった商品は「アーカイブ」として
  // 下部にまとめ、デフォルトでは折りたたんでおく（現在庫・顧客別集計と
  // 同じ扱い）。products は listProducts() 側で既に正しい並び順なので、
  // ここでは絞り込むだけで並べ直さない。
  const activeProducts = products.filter((p) => p.totalStock !== 0);
  const archivedProducts = products.filter((p) => p.totalStock === 0);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base font-semibold text-foreground">料金表一覧</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={editing ? "default" : "outline"}
            size="sm"
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? "編集を終了" : "編集する"}
          </Button>
          <ProductSyncButton onSynced={load} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          商品名と定価はWixの商品登録から自動で反映されます。原価・関係者価格・陸上部卸値・購買会卸値は誤入力を防ぐため通常は編集できません。変更するときは「編集する」を押してください（入力欄から離れると自動保存されます）。新規商品の登録時、陸上部卸値は定価の13%オフ、購買会卸値は定価の10%オフが自動で入力されます。
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleBackfillWholesale} disabled={backfilling}>
            {backfilling ? "入力中…" : "陸上部卸値・購買会卸値の空欄を一括入力"}
          </Button>
          {backfillMessage && <span className="text-sm text-muted-foreground">{backfillMessage}</span>}
        </div>

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
                  <TableHead className="text-right">原価率</TableHead>
                  <TableHead className="text-right">関係者価格</TableHead>
                  <TableHead className="text-right">陸上部卸値</TableHead>
                  <TableHead className="text-right">購買会卸値</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeProducts.map(renderProductRow)}
                {products.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      商品がありません。「今すぐWixと同期」を押してください。
                    </TableCell>
                  </TableRow>
                )}
                {archivedProducts.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-muted/30 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowArchived((v) => !v)}
                        className="text-muted-foreground"
                      >
                        {showArchived
                          ? "アーカイブを隠す"
                          : `アーカイブを表示（ACC・陸上部とも在庫0の${archivedProducts.length}件）`}
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
                {showArchived && archivedProducts.map(renderProductRow)}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
