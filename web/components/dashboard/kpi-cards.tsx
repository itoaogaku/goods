import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJPY, formatNumber } from "@/lib/utils";
import type { SalesSummary } from "@/lib/types";

interface KpiCardsProps {
  kpi: SalesSummary["kpi"];
  rangeStart: string;
  rangeEnd: string | null;
}

export function KpiCards({ kpi, rangeStart, rangeEnd }: KpiCardsProps) {
  const cards = [
    { label: "当月売上", value: formatJPY(kpi.currentMonthRevenue) },
    { label: "累計売上", value: formatJPY(kpi.cumulativeRevenue) },
    { label: "総販売個数", value: `${formatNumber(kpi.totalQuantity)} 個` },
    { label: "未対応注文数", value: `${formatNumber(kpi.pendingCount)} 件` },
    { label: "送料合計", value: formatJPY(kpi.shippingRevenue) },
    { label: "経費合計", value: formatJPY(kpi.expenseTotal) },
    { label: "損益", value: formatJPY(kpi.netProfit) },
  ];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        「当月売上」以外は表示期間（{rangeStart} 〜 {rangeEnd ?? "現在"}）の集計です。
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle>{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
