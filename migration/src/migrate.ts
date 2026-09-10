import { createOrderLinePage, fetchExistingLineIds, getDataSourceId } from "./notion.js";
import type { MigrationResult, OrderLine } from "./types.js";

const MIN_REQUEST_INTERVAL_MS = 350; // stays under Notion's ~3 req/s average rate limit
const MAX_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createWithRetry(dataSourceId: string, line: OrderLine): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      await createOrderLinePage(dataSourceId, line);
      return;
    } catch (error) {
      attempt += 1;
      const status = (error as { status?: number }).status;
      const retryable = status === 429 || (typeof status === "number" && status >= 500);
      if (!retryable || attempt > MAX_RETRIES) throw error;
      const backoffMs = 2 ** attempt * 500;
      await sleep(backoffMs);
    }
  }
}

export interface MigrateOptions {
  dryRun?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export async function migrateOrderLines(
  lines: OrderLine[],
  options: MigrateOptions = {}
): Promise<MigrationResult> {
  const result: MigrationResult = {
    totalRead: lines.length,
    created: 0,
    skippedDuplicate: 0,
    skippedInvalid: 0,
    failed: 0,
    errors: [],
  };

  const dataSourceId = await getDataSourceId();
  const existingLineIds = await fetchExistingLineIds(dataSourceId);

  let processed = 0;
  for (const line of lines) {
    processed += 1;
    options.onProgress?.(processed, lines.length);

    if (existingLineIds.has(line.lineId)) {
      result.skippedDuplicate += 1;
      continue;
    }

    if (options.dryRun) {
      existingLineIds.add(line.lineId);
      result.created += 1;
      continue;
    }

    try {
      await createWithRetry(dataSourceId, line);
      existingLineIds.add(line.lineId);
      result.created += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        lineId: line.lineId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    await sleep(MIN_REQUEST_INTERVAL_MS);
  }

  return result;
}
