"use client";

import { useProductNames } from "@/lib/use-product-names";

interface ProductNameInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

// A plain <select> (not the free-text autocomplete this used to be) so a
// value can only ever be an exact, existing 料金表一覧 name — typing a
// close-but-not-identical name used to silently create a second, unrelated
// product string that stock and sales couldn't reconcile against.
export function ProductNameInput({ value, onChange, required }: ProductNameInputProps) {
  const names = useProductNames();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="" disabled>
        選択してください
      </option>
      {names.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
