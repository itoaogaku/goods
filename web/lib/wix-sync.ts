import { createEvent, fetchExistingLineEvents, SALES_DATA_SINCE, updateEventStatus } from "./notion";
import { iterateWixOrderLines } from "./wix";
import type { Location } from "./types";

// Vercel kills this route's function at 60s (see app/api/acc/sync-wix's
// maxDuration). A years-long Wix order history can take far longer than
// that to fully process in one go — especially the first sync, before
// most lines are already in Notion and skippable — so this stops with
// plenty of headroom and lets the next run (cron or the manual button)
// pick up where it left off. Every write here is idempotent/dedup-safe,
// so stopping mid-page loses nothing.
const TIME_BUDGET_MS = 45_000;

// Notion's documented rate limit is an average of ~3 requests/second.
// Writing dozens of rows back to back with no gap risks 429s — and a
// burst of 429s tends to spill over onto whatever request the dashboard
// happens to make right after (e.g. the summary/pending-shipments
// refetch triggered by this sync finishing) — so pace writes out instead
// of firing them as fast as possible.
const WRITE_INTERVAL_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WixSyncResult {
  checked: number;
  created: number;
  statusUpdated: number;
  skipped: number;
  truncated: boolean;
  errors: string[];
}

/**
 * Pulls order lines from Wix, one page at a time, since WIX_SYNC_SINCE.
 * Creates any line not yet in Notion, and — since 発送済み/未発送 is read
 * straight from Wix's fulfillmentStatus (see lib/wix.ts) — updates the
 * ステータス of already-synced lines whenever Wix's current status differs
 * from what's in Notion (e.g. an order got marked fulfilled in Wix after
 * it first synced). Stops once TIME_BUDGET_MS has elapsed, however far
 * through Wix's order history that leaves it; run again to continue.
 */
export async function syncWixOrders(): Promise<WixSyncResult> {
  const apiKey = process.env.WIX_API_KEY;
  const siteId = process.env.WIX_SITE_ID;
  if (!apiKey || !siteId) {
    throw new Error("WIX_API_KEY / WIX_SITE_ID が設定されていません");
  }
  const location = (process.env.WIX_SYNC_LOCATION as Location | undefined) ?? "水上村";
  const since = process.env.WIX_SYNC_SINCE ?? SALES_DATA_SINCE;

  const existingEvents = await fetchExistingLineEvents("acc");
  const deadline = Date.now() + TIME_BUDGET_MS;

  let checked = 0;
  let created = 0;
  let statusUpdated = 0;
  let skipped = 0;
  let truncated = false;
  const errors: string[] = [];

  pages: for await (const page of iterateWixOrderLines({ apiKey, siteId, since, location })) {
    for (const line of page) {
      if (Date.now() > deadline) {
        truncated = true;
        break pages;
      }
      checked += 1;

      const existing = existingEvents.get(line.lineId);

      if (!existing) {
        try {
          const pageId = await createEvent("acc", line);
          created += 1;
          // Reflect this write in the in-memory dedup map immediately —
          // otherwise the same lineId appearing again later in this same
          // run (overlapping Wix pages, etc.) would look "new" against
          // the stale start-of-run snapshot and get created a second time.
          existingEvents.set(line.lineId, {
            pageId,
            transactionId: line.transactionId,
            lineId: line.lineId,
            eventType: line.eventType,
            occurredAt: line.occurredAt,
            location: line.location,
            destinationLocation: line.destinationLocation ?? null,
            productName: line.productName,
            quantity: line.quantity,
            unitPrice: line.unitPrice ?? 0,
            totalAmount: (line.unitPrice ?? 0) * line.quantity,
            memo: line.memo ?? "",
            status: line.status ?? "未発送",
            poStatus: line.poStatus ?? null,
            receivedQuantity: line.receivedQuantity ?? 0,
          });
        } catch (error) {
          errors.push(`${line.lineId}: ${error instanceof Error ? error.message : String(error)}`);
        }
        await sleep(WRITE_INTERVAL_MS);
        continue;
      }

      const newStatus = line.status ?? "未発送";
      if (existing.status === newStatus) {
        skipped += 1;
        continue;
      }
      try {
        await updateEventStatus("acc", existing.pageId, newStatus);
        statusUpdated += 1;
      } catch (error) {
        errors.push(`${line.lineId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(WRITE_INTERVAL_MS);
    }
  }

  return { checked, created, statusUpdated, skipped, truncated, errors };
}
