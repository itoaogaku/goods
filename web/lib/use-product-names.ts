"use client";

import { useEffect, useState } from "react";

/**
 * Product names from 料金表一覧 (which already includes each Wix size/color
 * variant as its own name, e.g. "アディダスパーカー / L") — offered as
 * autocomplete suggestions on manual 商品名 inputs so a typo doesn't
 * silently split one product's stock into two differently-spelled rows.
 */
export function useProductNames(): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/products/list");
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) {
          setNames((body.products ?? []).map((p: { productName: string }) => p.productName));
        }
      } catch {
        // Autocomplete is a nice-to-have — a failed fetch just leaves the
        // input as a plain free-text field, no error shown to the user.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return names;
}
