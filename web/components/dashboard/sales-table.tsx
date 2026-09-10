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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJPY, formatNumber } from "@/lib/utils";
import type { OrderStatus, SaleRecord, SalesListResponse } from "@/lib/types";

const STATUS_OPTIONS: OrderStatus[] = ["未発送", "発送済", "キャンセル", "返金"];

const STATUS_VARIANT: Record<OrderStatus, "warning" | "success" | "destructive" | "secondary"> = {
  未発送: "warning",
  発送済: "success",
  キャンセル: "destructive",
  返金: "secondary",
};

export function SalesTable() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [records, setRecords] = useState<SaleRecord[]>([]);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPageIndex(0);
      setCursorStack([null]);
      void fetchPage(null);
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, dateFrom, dateTo]);

  async function fetchPage(cursor: string | null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/sales/list?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SalesListResponse = await res.json();

      setRecords(data.records);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error(err);
      setError("販売データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    if (!hasMore || !nextCursor) return;
    const newStack = [...cursorStack, nextCursor];
    setCursorStack(newStack);
    setPageIndex(newStack.length - 1);
    void fetchPage(nextCursor);
  }

  function handlePrev() {
    if (pageIndex === 0) return;
    const newStack = cursorStack.slice(0, pageIndex);
    setCursorStack(newStack);
    setPageIndex(pageIndex - 1);
    void fetchPage(newStack[newStack.length - 1]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">販売データ一覧</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="商品名・注文IDで検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-64"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus | "all")}>
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="ステータス" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのステータス</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="sm:w-40"
            />
            <span className="text-sm text-muted-foreground">〜</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="sm:w-40"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>注文ID</TableHead>
                <TableHead>販売日時</TableHead>
                <TableHead>商品名</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">単価</TableHead>
                <TableHead className="text-right">合計金額</TableHead>
                <TableHead>ステータス</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.pageId}>
                  <TableCell className="font-mono text-xs">{record.orderId}</TableCell>
                  <TableCell>{record.soldAt}</TableCell>
                  <TableCell className="max-w-48 truncate">{record.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(record.quantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatJPY(record.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatJPY(record.totalAmount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[record.status]}>{record.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    条件に一致する販売データがありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{loading ? "読み込み中…" : `${records.length} 件表示`}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrev} disabled={pageIndex === 0 || loading}>
              前へ
            </Button>
            <Button variant="outline" size="sm" onClick={handleNext} disabled={!hasMore || loading}>
              次へ
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
