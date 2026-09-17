import { AnalyticsView } from "@/components/dashboard/analytics-view";
import { LEDGER_CONFIG } from "@/lib/ledger";

export default function TrackTeamAnalyticsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold">分析（{LEDGER_CONFIG.trackteam.shortLabel}）</h1>
        <p className="text-sm text-muted-foreground">
          商品別の利益率、拠点・種別ごとの売上構成、在庫の回転率をまとめて確認できます。
        </p>
      </div>
      <AnalyticsView ledger="trackteam" />
    </div>
  );
}
