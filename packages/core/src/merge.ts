import { compareClock, type Clock } from "./clock";
export type Scalar = string | number | boolean | null;
export interface Field {
  value: Scalar;
  clock: Clock;
}
export type Fields = Record<string, Field>;
export function mergeFields(a: Fields, b: Fields): Fields {
  return Object.fromEntries(
    [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().map((key) => {
      const left = a[key];
      const right = b[key];
      if (!left) return [key, right!];
      if (!right) return [key, left];
      const order = compareClock(left.clock, right.clock);
      // Corrupt/replayed same-stamp payloads have a deterministic final tie-break.
      return [
        key,
        order > 0 ||
        (order === 0 &&
          JSON.stringify(left.value) >= JSON.stringify(right.value))
          ? left
          : right,
      ];
    }),
  );
}
