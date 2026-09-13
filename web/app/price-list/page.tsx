import { PriceListTable } from "@/components/dashboard/price-list-table";

export default function PriceListPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold">料金表一覧</h1>
        <p className="text-sm text-muted-foreground">
          Wixに登録された商品の定価を自動で取り込み、関係者価格・陸上部卸値をあわせて管理します。
        </p>
      </div>
      <PriceListTable />
    </div>
  );
}
