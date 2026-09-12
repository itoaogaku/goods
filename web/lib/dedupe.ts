import { archivePage, findDuplicateLineGroups } from "./notion";
import type { Ledger } from "./types";

// Scanning the whole ledger (findDuplicateLineGroups) alone can take a
// meaningful chunk of a 60s function on a large database, so this budget
// covers the scan-plus-archive combined; running low mid-archive just
// means "click again" rather than losing anything (archiving is
// idempotent — a page that's already archived is simply skipped next
// time since it won't be in the live scan).
const TIME_BUDGET_MS = 50_000;

export interface DedupePreview {
  duplicateGroups: number;
  extraPages: number;
  sample: Array<{ lineId: string; productName: string; count: number }>;
}

/** Read-only: reports how many duplicate 明細ID groups exist, without changing anything. */
export async function previewDuplicates(ledger: Ledger): Promise<DedupePreview> {
  const groups = await findDuplicateLineGroups(ledger);
  const extraPages = groups.reduce((sum, g) => sum + g.pageIds.length - 1, 0);
  return {
    duplicateGroups: groups.length,
    extraPages,
    sample: groups
      .slice(0, 10)
      .map((g) => ({ lineId: g.lineId, productName: g.productName, count: g.pageIds.length })),
  };
}

export interface DedupeResult {
  remainingGroups: number;
  archived: number;
  truncated: boolean;
  errors: string[];
}

/**
 * Archives every duplicate page in each 明細ID group except the oldest one
 * (kept). Archiving moves a page to Notion's trash — recoverable there,
 * not a permanent delete. Time-boxed: stops with plenty of headroom under
 * the function's limit and reports how many groups are still duplicated,
 * so the caller knows whether to run it again.
 */
export async function archiveDuplicates(ledger: Ledger): Promise<DedupeResult> {
  const groups = await findDuplicateLineGroups(ledger);
  const deadline = Date.now() + TIME_BUDGET_MS;

  let archived = 0;
  let truncated = false;
  const errors: string[] = [];
  let groupIndex = 0;

  outer: for (; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const toArchive = group.pageIds.slice(1); // keep the oldest page (index 0)
    for (const pageId of toArchive) {
      if (Date.now() > deadline) {
        truncated = true;
        break outer;
      }
      try {
        await archivePage(pageId);
        archived += 1;
      } catch (error) {
        errors.push(`${group.lineId} (${pageId}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { remainingGroups: groups.length - groupIndex, archived, truncated, errors };
}
