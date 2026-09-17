import { CustomerMatrixTable } from "@/components/dashboard/customer-matrix-table";
import { LEDGER_CONFIG } from "@/lib/ledger";

export default function TrackTeamCustomerMatrixPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold">顧客別集計（{LEDGER_CONFIG.trackteam.shortLabel}）</h1>
        <p className="text-sm text-muted-foreground">
          陸上部の在庫・販売の記録を、取引ごとにまとめて確認できます。
        </p>
      </div>
      <CustomerMatrixTable ledger="trackteam" />
    </div>
  );
}
