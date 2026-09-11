/** Short random suffix, not cryptographically meaningful — just enough to avoid collisions in a single request. */
function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function datePart(occurredAt: string): string {
  return (occurredAt || new Date().toISOString()).slice(0, 10).replace(/-/g, "");
}

export function generateTransactionId(prefix: string, occurredAt: string): string {
  return `${prefix}-${datePart(occurredAt)}-${shortId()}`;
}

export function generateLineId(prefix: string): string {
  return `${prefix}_${Date.now()}_${shortId()}`;
}
