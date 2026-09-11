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
import { EVENT_TYPES, LEDGER_CONFIG } from "@/lib/ledger";
import type { EventListResponse, EventType, InventoryEvent, Ledger, OrderStatus } from "@/lib/types";

const STATUS_OPTIONS: OrderStatus[] = ["未発送", "発送済", "キャンセル", "返金"];

const STATUS_VARIANT: Record<OrderStatus, "warning" | "success" | "destructive" | "secondary"> = {
  未発送: "warning",
  発送済: "success",
  キャンセル: "destructive",
  返金: "secondary",
};

const EVENT_TYPE_VARIANT: Record<EventType, "success" | "warning" | "secondary" | "outline"> = {
  発注: "outline",
  入庫: "success",
  通常販売: "outline",
  関係者価格販売: "secondary",
  プレゼント: "secondary",
  拠点間移動: "warning",
  卸し: "outline",
  棚卸調整: "warning",
};

interface EventTableProps {
  ledger: Ledger;
  refreshKey: number;
}

export function EventTable({ ledger, refreshKey }: EventTableProps) {
  const config = LEDGER_CONFIG[ledger];

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [eventType, setEventType] = useState<EventType | "all">("all");
  const [location, setLocation] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [records, setRecords] = useState<InventoryEvent[]>([]);
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
  }, [search, status, eventType, location, dateFrom, dateTo, refreshKey]);

  async function fetchPage(cursor: string | null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      if (eventType !== "all") params.set("eventType", eventType);
      if (location !== "all") params.set("location", location);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/${ledger}/list?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: EventListResponse = await res.json();

      setRecords(data.records);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error(err);
      setError("データの取得に失敗しました");
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
        <CardTitle className="text-base font-semibold text-foreground">取引・在庫履歴</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="商品名・取引IDで検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-56"
          />
          <Select value={eventType} onValueChange={(v) => setEventType(v as EventType | "all")}>
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="種別" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての種別</SelectItem>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {config.locations.length > 1 && (
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger className="sm:w-32">
                <SelectValue placeholder="拠点" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての拠点</SelectItem>
                {config.locations.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus | "all")}>
            <SelectTrigger className="sm:w-36">
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
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="sm:w-36" />
            <span className="text-sm text-muted-foreground">〜</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="sm:w-36" />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>取引ID</TableHead>
                <TableHead>日時</TableHead>
                <TableHead>種別</TableHead>
                {config.locations.length > 1 && <TableHead>拠点</TableHead>}
                <TableHead>商品名</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">単価</TableHead>
                <TableHead className="text-right">合計金額</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>備考</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.pageId}>
                  <TableCell className="font-mono text-xs">{record.transactionId}</TableCell>
                  <TableCell className="whitespace-nowrap">{record.occurredAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    <Badge variant={EVENT_TYPE_VARIANT[record.eventType]}>{record.eventType}</Badge>
                  </TableCell>
                  {config.locations.length > 1 && (
                    <TableCell>
                      {record.location}
                      {record.destinationLocation ? ` → ${record.destinationLocation}` : ""}
                    </TableCell>
                  )}
                  <TableCell className="max-w-48 truncate">{record.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(record.quantity)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatJPY(record.unitPrice)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatJPY(record.totalAmount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[record.status]}>{record.status}</Badge>
                  </TableCell>
                  <TableCell className="max-w-32 truncate text-muted-foreground">{record.memo}</TableCell>
                </TableRow>
              ))}
              {!loading && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    条件に一致するデータがありません
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
