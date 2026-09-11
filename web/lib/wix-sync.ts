import { createEvent, fetchExistingLineIds, SALES_DATA_SINCE } from "./notion";
import { fetchWixOrderLines } from "./wix";
import type { Location } from "./types";

// Cap the number of new Notion pages written per invocation so a single
// cron run can't run past the serverless function's execution time limit.
// Anything left over is picked up on the next scheduled run.
const MAX_CREATES_PER_RUN = 200;

export interface WixSyncResult {
  checked: number;
  created: number;
  skipped: number;
  truncated: boolean;
  errors: string[];
}

export async function syncWixOrders(): Promise<WixSyncResult> {
  const apiKey = process.env.WIX_API_KEY;
  const siteId = process.env.WIX_SITE_ID;
  if (!apiKey || !siteId) {
    throw new Error("WIX_API_KEY / WIX_SITE_ID が設定されていません");
  }
  const location = (process.env.WIX_SYNC_LOCATION as Location | undefined) ?? "水上村";
  const since = process.env.WIX_SYNC_SINCE ?? SALES_DATA_SINCE;

  const [lines, existingLineIds] = await Promise.all([
    fetchWixOrderLines({ apiKey, siteId, since, location }),
    fetchExistingLineIds("acc"),
  ]);

  let created = 0;
  let skipped = 0;
  let truncated = false;
  const errors: string[] = [];

  for (const line of lines) {
    if (existingLineIds.has(line.lineId)) {
      skipped += 1;
      continue;
    }
    if (created >= MAX_CREATES_PER_RUN) {
      truncated = true;
      break;
    }
    try {
      await createEvent("acc", line);
      created += 1;
    } catch (error) {
      errors.push(`${line.lineId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { checked: lines.length, created, skipped, truncated, errors };
}
