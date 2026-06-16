"use client";

import { useRef, useState } from "react";

// Lightweight, dependency-free SVG charts. They scale to their container via a
// fixed viewBox (width: 100%), and map hover to the nearest point by x-ratio so
// the tooltip works at any rendered width. Colors come from props (CSS vars OK),
// so they theme with the rest of the app.

export interface Series {
  key: string;
  label: string;
  color: string;
  kind?: "area" | "line"; // area draws a filled gradient; line is a stroke only
}

interface Point {
  label: string; // x-axis label (e.g. a date)
  values: Record<string, number>;
}

const VB_W = 640;
const VB_H = 200;
const PAD = { top: 14, right: 12, bottom: 22, left: 38 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function TimeSeriesChart({
  points,
  series,
  formatValue = (n) => n.toLocaleString(),
  height = 200,
}: {
  points: Point[];
  series: Series[];
  formatValue?: (n: number) => string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = points.length;
  const plotW = VB_W - PAD.left - PAD.right;
  const plotH = VB_H - PAD.top - PAD.bottom;
  const maxVal = niceMax(
    Math.max(1, ...points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0)))
  );

  const xOf = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (v: number) => PAD.top + plotH * (1 - v / maxVal);

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (n - 1)));
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative w-full" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={height} preserveAspectRatio="none" role="img">
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* horizontal grid + y labels */}
        {gridLines.map((g) => {
          const y = PAD.top + plotH * g;
          const val = Math.round(maxVal * (1 - g));
          return (
            <g key={g}>
              <line x1={PAD.left} y1={y} x2={VB_W - PAD.right} y2={y} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="currentColor" fillOpacity="0.45">
                {val >= 1000 ? (val / 1000).toFixed(val % 1000 ? 1 : 0) + "k" : val}
              </text>
            </g>
          );
        })}

        {/* series */}
        {series.map((s) => {
          const pts = points.map((p, i) => [xOf(i), yOf(p.values[s.key] ?? 0)] as const);
          const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
          const area = `${line} L${xOf(n - 1).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} L${xOf(0).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} Z`;
          return (
            <g key={s.key}>
              {s.kind !== "line" && <path d={area} fill={`url(#grad-${s.key})`} />}
              <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}

        {/* x labels: first, middle, last */}
        {[0, Math.floor((n - 1) / 2), n - 1].filter((i, idx, a) => i >= 0 && a.indexOf(i) === idx).map((i) => (
          <text key={i} x={xOf(i)} y={VB_H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="9" fill="currentColor" fillOpacity="0.45">
            {points[i]?.label}
          </text>
        ))}

        {/* hover guide + markers */}
        {hover != null && points[hover] && (
          <g>
            <line x1={xOf(hover)} y1={PAD.top} x2={xOf(hover)} y2={PAD.top + plotH} stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
            {series.map((s) => (
              <circle key={s.key} cx={xOf(hover)} cy={yOf(points[hover].values[s.key] ?? 0)} r="3.2" fill={s.color} stroke="var(--background, #fff)" strokeWidth="1.5" />
            ))}
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hover != null && points[hover] && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md border bg-popover px-2 py-1.5 text-xs shadow-md"
          style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%` }}
        >
          <div className="mb-1 font-medium">{points[hover].label}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-medium">{formatValue(points[hover].values[s.key] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
