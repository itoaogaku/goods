import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { normalizeStatus } from "./status.js";
import type { Location, OrderLine } from "./types.js";

export interface CsvColumnMap {
  orderId: string;
  orderDate: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  status: string;
}

/**
 * Column names as they appear in a typical "Export Orders" CSV from the Wix
 * Stores / Wix eCommerce dashboard. Wix's exact header text can vary by
 * store locale and export version, so verify against your real file and
 * override with --col-* CLI flags (see cli.ts) if any of these don't match.
 */
export const DEFAULT_COLUMN_MAP: CsvColumnMap = {
  orderId: "Order Number",
  orderDate: "Order Date",
  productName: "Item Name",
  quantity: "Item Quantity",
  unitPrice: "Item Price",
  status: "Fulfillment Status",
};

export interface CsvParseResult {
  lines: OrderLine[];
  invalidRows: Array<{ rowNumber: number; reason: string }>;
}

function parseAmount(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[^\d.-]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function parseWixOrdersCsv(
  filePath: string,
  columnMap: CsvColumnMap = DEFAULT_COLUMN_MAP,
  location: Location = "水上村"
): CsvParseResult {
  const raw = readFileSync(filePath, "utf-8");
  const rows: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  const lines: OrderLine[] = [];
  const invalidRows: CsvParseResult["invalidRows"] = [];
  const lineIndexByOrder = new Map<string, number>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for 0-index, +1 for header row
    const orderId = row[columnMap.orderId]?.trim();
    const soldAt = parseDate(row[columnMap.orderDate]);
    const productName = row[columnMap.productName]?.trim();
    const quantity = parseAmount(row[columnMap.quantity]);
    const unitPrice = parseAmount(row[columnMap.unitPrice]);

    if (!orderId) {
      invalidRows.push({ rowNumber, reason: `${columnMap.orderId} が空です` });
      return;
    }
    if (!soldAt) {
      invalidRows.push({ rowNumber, reason: `${columnMap.orderDate} を日付として解釈できません` });
      return;
    }
    if (!productName) {
      invalidRows.push({ rowNumber, reason: `${columnMap.productName} が空です` });
      return;
    }
    if (quantity === null || quantity <= 0) {
      invalidRows.push({ rowNumber, reason: `${columnMap.quantity} が不正です` });
      return;
    }
    if (unitPrice === null || unitPrice < 0) {
      invalidRows.push({ rowNumber, reason: `${columnMap.unitPrice} が不正です` });
      return;
    }

    const lineIndex = (lineIndexByOrder.get(orderId) ?? 0) + 1;
    lineIndexByOrder.set(orderId, lineIndex);

    lines.push({
      orderId,
      lineId: `${orderId}_${lineIndex}`,
      soldAt,
      location,
      productName,
      quantity,
      unitPrice,
      totalAmount: quantity * unitPrice,
      status: normalizeStatus(row[columnMap.status]),
    });
  });

  return { lines, invalidRows };
}
