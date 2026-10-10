/** Exact rational ranks avoid renumbering neighboring pages during ordinary reordering. */
function fraction(value: unknown): [bigint, bigint] {
  if (typeof value === "number" && Number.isSafeInteger(value))
    return [BigInt(value), 1n];
  if (
    typeof value === "string" &&
    value.length <= 2048 &&
    /^-?\d+\/[1-9]\d*$/.test(value)
  ) {
    const [n, d] = value.split("/");
    return [BigInt(n!), BigInt(d!)];
  }
  return [0n, 1n];
}
export function compareOrder(a: unknown, b: unknown): number {
  const [an, ad] = fraction(a),
    [bn, bd] = fraction(b),
    difference = an * bd - bn * ad;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
export function orderBetween(
  before: unknown | null,
  after: unknown | null,
): string {
  if (before === null && after === null) return "0/1";
  if (before === null) {
    const [n, d] = fraction(after);
    return `${n - d}/${d}`;
  }
  if (after === null) {
    const [n, d] = fraction(before);
    return `${n + d}/${d}`;
  }
  if (compareOrder(before, after) >= 0)
    throw new Error("Page ordering boundaries must be increasing");
  const [an, ad] = fraction(before),
    [bn, bd] = fraction(after);
  return `${an + bn}/${ad + bd}`;
}
