import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatJPY(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat("ja-JP").format(amount);
}

// Larger sizes first, matching how the shop wants sized products listed —
// plain alphabetical order would put "XL" and "XS" after "S", between
// unrelated products.
const SIZE_ORDER = ["XL", "L", "M", "S", "XS"];

function sizeRank(token: string): number {
  const idx = SIZE_ORDER.indexOf(token.trim().toUpperCase());
  return idx === -1 ? Number.POSITIVE_INFINITY : idx;
}

/**
 * Compares two 商品名 strings segment-by-segment (products/colors/variants
 * are joined with " / ", e.g. "アディダスパーカー / グリーン / L") — each
 * segment sorts by SIZE_ORDER when it's a recognized size token, otherwise
 * alphabetically. This keeps a product's own size variants grouped and
 * ordered XL/L/M/S/XS instead of the alphabetical L/M/S/XL/XS.
 */
export function compareProductNames(a: string, b: string): number {
  const partsA = a.split(" / ");
  const partsB = b.split(" / ");
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const partA = partsA[i] ?? "";
    const partB = partsB[i] ?? "";
    const rankA = sizeRank(partA);
    const rankB = sizeRank(partB);
    if (rankA !== rankB) return rankA - rankB;
    if (rankA === Number.POSITIVE_INFINITY) {
      const cmp = partA.localeCompare(partB, "ja");
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}
