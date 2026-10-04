import { code128Modules } from "@/lib/code128";

/** Inline SVG Code 128 barcode (prints crisply at any size). */
export default function Barcode({ value, height = 44, showText = true }: { value: string; height?: number; showText?: boolean }) {
  const mods = code128Modules(value);
  const quiet = 10;
  let x = quiet;
  const bars: React.ReactNode[] = [];
  mods.forEach((w, i) => {
    if (i % 2 === 0) bars.push(<rect key={i} x={x} y={0} width={w} height={height} fill="#000" />);
    x += w;
  });
  const width = x + quiet;
  return (
    <svg viewBox={`0 0 ${width} ${height + (showText ? 14 : 0)}`} preserveAspectRatio="xMidYMid meet" className="h-auto w-full" role="img" aria-label={`Barcode ${value}`}>
      <rect width={width} height={height + (showText ? 14 : 0)} fill="#fff" />
      {bars}
      {showText && <text x={width / 2} y={height + 11} textAnchor="middle" fontFamily="monospace" fontSize="10" fill="#000">{value}</text>}
    </svg>
  );
}
