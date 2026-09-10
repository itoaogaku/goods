import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJPY, formatNumber } from "@/lib/utils";
import type { ProductRankingEntry } from "@/lib/types";

interface ProductRankingProps {
  data: ProductRankingEntry[];
}

export function ProductRanking({ data }: ProductRankingProps) {
  const top = data.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">
          商品別ランキング（販売個数順）
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2">
          {top.map((entry, index) => (
            <li
              key={entry.productName}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                  {index + 1}
                </span>
                <span className="truncate">{entry.productName || "(商品名なし)"}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span className="font-medium">{formatNumber(entry.quantity)}個</span>
                <span className="text-xs text-muted-foreground">{formatJPY(entry.revenue)}</span>
              </span>
            </li>
          ))}
          {top.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">データがありません</p>
          )}
        </ol>
      </CardContent>
    </Card>
  );
}
