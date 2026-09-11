"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StockInForm } from "./stock-in-form";
import { TransferForm } from "./transfer-form";
import { ManualEntryForm } from "./manual-entry-form";
import { LEDGER_CONFIG } from "@/lib/ledger";
import type { Ledger } from "@/lib/types";

interface InventoryFormsProps {
  ledger: Ledger;
  onChanged: () => void;
}

export function InventoryForms({ ledger, onChanged }: InventoryFormsProps) {
  const config = LEDGER_CONFIG[ledger];
  const tabs = [
    { key: "stock-in", label: "在庫登録" },
    ...(config.allowTransfer ? [{ key: "transfer", label: "拠点間移動" }] : []),
    { key: "manual", label: "手入力記録" },
  ] as const;

  const [active, setActive] = useState<(typeof tabs)[number]["key"]>("stock-in");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">在庫・取引の登録</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              type="button"
              size="sm"
              variant={active === tab.key ? "default" : "outline"}
              onClick={() => setActive(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {active === "stock-in" && <StockInForm ledger={ledger} onSuccess={onChanged} />}
        {active === "transfer" && config.allowTransfer && (
          <TransferForm ledger={ledger} onSuccess={onChanged} />
        )}
        {active === "manual" && <ManualEntryForm ledger={ledger} onSuccess={onChanged} />}
      </CardContent>
    </Card>
  );
}
