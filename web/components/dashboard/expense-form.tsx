"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Ledger } from "@/lib/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ExpenseFormProps {
  ledger: Ledger;
  onSuccess: () => void;
}

export function ExpenseForm({ ledger, onSuccess }: ExpenseFormProps) {
  const [category, setCategory] = useState("");
  const [occurredAt, setOccurredAt] = useState(today());
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/${ledger}/expense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, occurredAt, amount: Number(amount), memo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setMessage({ type: "success", text: "経費を登録しました" });
      setCategory("");
      setAmount("");
      setMemo("");
      onSuccess();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "登録に失敗しました" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        家賃・資材費・送料など、仕入れ以外でかかった経費を記録します。商品の仕入れ費用は「在庫登録」画面の「仕入れ金額」欄から登録してください。
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          内容（例: 家賃・梱包資材）
          <Input value={category} onChange={(e) => setCategory(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          日時
          <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          金額
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          備考（任意）
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
      </div>
      {message && (
        <p className={`text-sm ${message.type === "error" ? "text-destructive" : "text-emerald-600"}`}>
          {message.text}
        </p>
      )}
      <Button type="submit" disabled={submitting} className="self-start">
        {submitting ? "登録中…" : "経費登録"}
      </Button>
    </form>
  );
}
