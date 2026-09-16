"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CustomerMatrixTable } from "@/components/dashboard/customer-matrix-table";
import { LEDGERS, LEDGER_CONFIG } from "@/lib/ledger";
import type { Ledger } from "@/lib/types";

export default function CustomerMatrixPage() {
  const [ledger, setLedger] = useState<Ledger>("acc");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">顧客別集計（{LEDGER_CONFIG[ledger].shortLabel}）</h1>
          <p className="text-sm text-muted-foreground">
            {ledger === "acc"
              ? "Wixで注文した方のお名前ごとに、購入商品と送料をまとめて確認できます。"
              : "陸上部の在庫・販売の記録を、取引ごとにまとめて確認できます。"}
          </p>
        </div>
        <div className="flex gap-2">
          {LEDGERS.map((l) => (
            <Button
              key={l}
              type="button"
              size="sm"
              variant={ledger === l ? "default" : "outline"}
              onClick={() => setLedger(l)}
            >
              {LEDGER_CONFIG[l].shortLabel}
            </Button>
          ))}
        </div>
      </div>
      <CustomerMatrixTable ledger={ledger} />
    </div>
  );
}
