"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export interface DateRange {
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function thisMonthRange(): DateRange {
  const now = new Date();
  return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: undefined };
}

function lastMonthRange(): DateRange {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return {
    from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`,
    to: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(lastDay)}`,
  };
}

const PRESETS: { label: string; range: DateRange }[] = [
  { label: "全期間", range: {} },
  { label: "今月", range: thisMonthRange() },
  { label: "先月", range: lastMonthRange() },
];

function sameRange(a: DateRange, b: DateRange): boolean {
  return (a.from ?? "") === (b.from ?? "") && (a.to ?? "") === (b.to ?? "");
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              type="button"
              size="sm"
              variant={sameRange(value, p.range) ? "default" : "outline"}
              onClick={() => onChange(p.range)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Input
            type="date"
            value={value.from ?? ""}
            onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
            className="w-auto"
            aria-label="開始日"
          />
          <span className="text-muted-foreground">〜</span>
          <Input
            type="date"
            value={value.to ?? ""}
            onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
            className="w-auto"
            aria-label="終了日"
          />
        </div>
      </CardContent>
    </Card>
  );
}
