export const FREE_LIMITS = { database: 500_000_000, files: 1_000_000_000, realtimeMessages: 2_000_000, functions: 500_000 } as const;
export function quotaState(used: number | null, limit: number, incoming = 0): 'unknown' | 'normal' | 'warning' | 'full' {
  if (used === null || !Number.isFinite(used) || !Number.isFinite(limit) || !Number.isFinite(incoming) || used < 0 || limit <= 0 || incoming < 0) return 'unknown';
  const ratio = (used + incoming) / limit;
  return ratio >= 1 ? 'full' : ratio >= 0.7 ? 'warning' : 'normal';
}
export function allowCloudWrite(used: number | null, limit: number, incoming = 0): boolean {
  const state = quotaState(used, limit, incoming);
  return state === 'normal' || state === 'warning';
}
