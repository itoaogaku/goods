import { CustomerMatrixTable } from "@/components/dashboard/customer-matrix-table";

export default function CustomerMatrixPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold">顧客別集計（アスリートキャリアセンター）</h1>
        <p className="text-sm text-muted-foreground">
          Wixで注文した方のお名前ごとに、購入商品と送料をまとめて確認できます。
        </p>
      </div>
      <CustomerMatrixTable ledger="acc" />
    </div>
  );
}
