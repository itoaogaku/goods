"use client";

import { useEffect, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LEDGER_CONFIG } from "@/lib/ledger";
import { cn, formatJPY, formatNumber } from "@/lib/utils";
import type { CustomerMatrixResponse, Ledger } from "@/lib/types";

interface CustomerMatrixTableProps {
  ledger: Ledger;
}

const ROW_LABEL: Record<CustomerMatrixResponse["rows"][number]["rowKind"], string> = {
  order: "―",
  "stock-in": "（在庫追加）",
  transfer: "（拠点間移動）",
};

const ROW_TINT: Record<CustomerMatrixResponse["rows"][number]["rowKind"], string | undefined> = {
  order: undefined,
  "stock-in": "bg-emerald-500/5",
  transfer: "bg-amber-500/5",
};

// 左側3列（取引ID・名前・日時）を横スクロール時にも固定表示するため、
// 下に隠れる行の色が透けないよう不透明な背景色を別途指定する。
const STICKY_CELL_BG: Record<CustomerMatrixResponse["rows"][number]["rowKind"], string> = {
  order: "bg-background",
  "stock-in": "bg-emerald-50",
  transfer: "bg-amber-50",
};

export function CustomerMatrixTable({ ledger }: CustomerMatrixTableProps) {
  const locations = LEDGER_CONFIG[ledger].locations;
  const [location, setLocation] = useState(locations[0]);
  const [data, setData] = useState<CustomerMatrixResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [jumpDate, setJumpDate] = useState("");
  const [jumpMessage, setJumpMessage] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/${ledger}/customer-matrix?location=${encodeURIComponent(location)}`);
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
  }, [ledger, location]);

  // Rows are newest-first, so the first row whose date is on-or-before the
  // requested date is the closest match to "jump to around this date";
  // falling back to the oldest row covers a date older than all of them.
  function handleJump() {
    if (!data || !jumpDate) return;
    const match = data.rows.find((r) => r.orderDate.slice(0, 10) <= jumpDate) ?? data.rows[data.rows.length - 1];
    const el = match ? rowRefs.current.get(match.transactionId) : undefined;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setJumpMessage(null);
    } else {
      setJumpMessage("該当する行が見つかりませんでした");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base font-semibold text-foreground">顧客別・商品別集計</CardTitle>
        {locations.length > 1 && (
          <div className="flex gap-2">
            {locations.map((loc) => (
              <Button
                key={loc}
                type="button"
                size="sm"
                variant={location === loc ? "default" : "outline"}
                onClick={() => setLocation(loc)}
              >
                {loc}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {location}の在庫・注文のみを表示しています。新しい行が一番上に表示されます。各商品列には、その行での増減（注文は−、在庫追加・移動入庫は+）と、その時点での{location}の残り在庫数を表示します。横にスクロールすると全商品を確認できます(取引ID・名前・日時の列とヘッダー行は固定表示されます)。
        </p>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            日付で移動
            <Input
              type="date"
              value={jumpDate}
              onChange={(e) => setJumpDate(e.target.value)}
              className="w-auto"
            />
          </label>
          <Button type="button" size="sm" variant="outline" onClick={handleJump} disabled={!jumpDate}>
            移動
          </Button>
          {jumpMessage && <span className="text-muted-foreground">{jumpMessage}</span>}
        </div>

        {loading && <p className="text-sm text-muted-foreground">読み込み中…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {data && (
          // Table's own wrapper div (components/ui/table.tsx) also sets
          // overflow-auto, which per the CSS spec makes IT a scroll
          // container too regardless of whether it ever actually needs to
          // scroll. With no height of its own it never does, so it just
          // silently absorbs "sticky" positioning without ever moving —
          // exactly the "works on desktop, header scrolls away on iPhone"
          // bug reported. [&>div]:overflow-visible cancels that inner
          // scroll container so this div (the one with a real bounded
          // height) is unambiguously the one sticky positioning refers to.
          <div className="max-h-[70vh] overflow-auto rounded-md border border-border [&>div]:overflow-visible">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky top-0 left-0 z-30 w-24 bg-background">取引ID</TableHead>
                  <TableHead className="sticky top-0 left-24 z-30 w-32 bg-background">名前</TableHead>
                  <TableHead className="sticky top-0 left-[224px] z-30 w-28 whitespace-nowrap bg-background">
                    日時
                  </TableHead>
                  {data.columns.map((col) => (
                    <TableHead
                      key={col}
                      className="sticky top-0 z-20 h-32 max-h-40 whitespace-normal border-l border-border bg-background align-bottom [text-orientation:mixed] [writing-mode:vertical-rl]"
                      title={col}
                    >
                      {col}
                    </TableHead>
                  ))}
                  <TableHead className="sticky top-0 z-20 bg-background text-right">商品売上</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background text-right">送料</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background text-right">売上合計</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">備考</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow
                    key={row.transactionId}
                    ref={(el) => {
                      if (el) rowRefs.current.set(row.transactionId, el);
                      else rowRefs.current.delete(row.transactionId);
                    }}
                    className={ROW_TINT[row.rowKind]}
                  >
                    <TableCell
                      className={cn("sticky left-0 z-10 w-24 font-mono text-xs", STICKY_CELL_BG[row.rowKind])}
                    >
                      {row.transactionId}
                    </TableCell>
                    <TableCell className={cn("sticky left-24 z-10 w-32 max-w-32 truncate", STICKY_CELL_BG[row.rowKind])}>
                      {/* 陸上部の卸し（購買会など）や手入力販売はWix連携が無く顧客名が空なので、
                          代わりに備考（卸し先・宛名など）を表示する */}
                      {row.customerName || (row.rowKind === "order" ? row.memo : "") || ROW_LABEL[row.rowKind]}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "sticky left-[224px] z-10 w-28 whitespace-nowrap",
                        STICKY_CELL_BG[row.rowKind]
                      )}
                    >
                      {row.orderDate.slice(0, 10)}
                    </TableCell>
                    {data.columns.map((col) => {
                      const cell = row.products[col];
                      return (
                        <TableCell
                          key={col}
                          className="whitespace-nowrap border-l border-border text-right text-xs tabular-nums"
                        >
                          <div
                            className={cn(
                              "font-medium",
                              cell.delta > 0 && "text-emerald-600",
                              cell.delta < 0 && "text-destructive"
                            )}
                          >
                            {cell.delta > 0 ? `+${formatNumber(cell.delta)}` : formatNumber(cell.delta)}
                          </div>
                          <div className="text-muted-foreground">残{formatNumber(cell.balance)}</div>
                        </TableCell>
                      );
                    })}
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
