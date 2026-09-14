"use client";

import { useEffect, useState } from "react";
import type { ProductPriceEntry } from "./types";

/**
 * Full 料金表一覧 entries (not just names — see use-product-names.ts) used
 * to auto-fill the manual-entry form's 単価 from the price field matching
 * the selected 商品名 + 種別, instead of always defaulting to 0.
 */
export function useProductPrices(): ProductPriceEntry[] {
  const [prices, setPrices] = useState<ProductPriceEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/products/list");
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setPrices(body.products ?? []);
      } catch {
        // Auto-fill is a nice-to-have — a failed fetch just leaves 単価 as
        // a plain manual field, same as before this existed.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return prices;
}
