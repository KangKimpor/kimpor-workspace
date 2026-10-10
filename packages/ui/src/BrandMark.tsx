// Generated from brand/svg/mark-bold.svg by pnpm brand:build.
const strokes = [
  "M33.53 81.63 Q33.90 73.02 36.15 64.41 L38.40 55.80",
  "M37.65 12.00 L39.14 47.19",
  "M38.40 55.80 L39.14 50.56",
  "M38.40 55.80 Q41.76 54.67 42.51 52.99 L43.26 51.30",
  "M39.14 47.19 L39.14 50.56",
  "M39.14 47.19 Q51.87 37.08 55.80 35.77 Q59.73 34.46 59.55 36.33 Q59.36 38.20 55.61 43.07 L51.87 47.94",
  "M39.14 50.56 L43.26 51.30",
  "M43.26 51.30 L51.87 47.94",
  "M51.87 47.94 Q58.61 49.06 60.11 50.93 Q61.60 52.80 63.29 67.40 L64.97 82.00",
  "M64.97 82.00 L66.47 79.75",
  "M24.95 92.00 Q31.36 86.88 32.32 84.95 Q33.28 83.03 56.66 67.02 L80.05 51.00"
];
export function BrandMark({ size = 24 }: { size?: number }) {
  return <svg viewBox="0 0 100 100" width={size} height={size} fill="none" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">{strokes.map((d, index) => <path key={index} d={d}/>)}</g></svg>;
}
