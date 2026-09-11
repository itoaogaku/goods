import { createEvent, fetchExistingLineEvents, SALES_DATA_SINCE, updateEventStatus } from "./notion";
import { fetchWixOrderLines } from "./wix";
import type { Location } from "./types";

// Cap the number of Notion writes (creates + status updates) per
// invocation so a single cron run can't run past the serverless
// function's execution time limit. Anything left over is picked up on
// the next scheduled run.
const MAX_CREATES_PER_RUN = 200;
const MAX_STATUS_UPDATES_PER_RUN = 200;

export interface WixSyncResult {
  checked: number;
  created: number;
  statusUpdated: number;
  skipped: number;
  truncated: boolean;
  errors: string[];
}

/**
 * Pulls every order line from Wix since WIX_SYNC_SINCE, creates any that
 * aren't in Notion yet, and — since 発送済み/未発送 is read straight from
 * Wix's fulfillmentStatus (see lib/wix.ts) — updates the ステータス of
 * already-synced lines whenever Wix's current status differs from what's
 * in Notion (e.g. an order got marked fulfilled in Wix after it first synced).
 */
export async function syncWixOrders(): Promise<WixSyncResult> {
  const apiKey = process.env.WIX_API_KEY;
  const siteId = process.env.WIX_SITE_ID;
  if (!apiKey || !siteId) {
    throw new Error("WIX_API_KEY / WIX_SITE_ID が設定されていません");
  }
  const location = (process.env.WIX_SYNC_LOCATION as Location | undefined) ?? "水上村";
  const since = process.env.WIX_SYNC_SINCE ?? SALES_DATA_SINCE;

  const [lines, existingEvents] = await Promise.all([
    fetchWixOrderLines({ apiKey, siteId, since, location }),
    fetchExistingLineEvents("acc"),
  ]);

  let created = 0;
  let statusUpdated = 0;
  let skipped = 0;
  let truncated = false;
  const errors: string[] = [];

  for (const line of lines) {
    const existing = existingEvents.get(line.lineId);

    if (!existing) {
      if (created >= MAX_CREATES_PER_RUN) {
        truncated = true;
        continue;
      }
      try {
        await createEvent("acc", line);
        created += 1;
      } catch (error) {
        errors.push(`${line.lineId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      continue;
    }

    const newStatus = line.status ?? "未発送";
    if (existing.status === newStatus) {
      skipped += 1;
      continue;
    }

    if (statusUpdated >= MAX_STATUS_UPDATES_PER_RUN) {
      truncated = true;
      continue;
    }
    try {
      await updateEventStatus("acc", existing.pageId, newStatus);
      statusUpdated += 1;
    } catch (error) {
      errors.push(`${line.lineId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { checked: lines.length, created, statusUpdated, skipped, truncated, errors };
}
