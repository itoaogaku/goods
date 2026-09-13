"use client";

import { Input } from "@/components/ui/input";
import { useProductNames } from "@/lib/use-product-names";

interface ProductNameInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

// A shared datalist ID is fine — this component is never rendered twice
// on the same page.
const DATALIST_ID = "product-name-suggestions";

export function ProductNameInput({ value, onChange, required }: ProductNameInputProps) {
  const names = useProductNames();

  return (
    <>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={DATALIST_ID}
        required={required}
      />
      <datalist id={DATALIST_ID}>
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}
