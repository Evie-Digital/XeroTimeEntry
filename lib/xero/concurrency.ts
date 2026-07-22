// lib/xero/concurrency.ts — a tiny fixed-size concurrency limiter.
//
// The `/week` full-scan fans a per-project Xero call out across ALL active
// projects, but Xero allows only 5 concurrent calls per tenant (ARCHITECTURE
// §5). This runs `fn` over `items` with at most `limit` in flight at once —
// a fixed pool of workers that pull the next index until the list is drained.
// Results preserve input order.

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };

  const poolSize = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return results;
}
