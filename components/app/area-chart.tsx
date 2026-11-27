'use client';

import { useState } from 'react';

// One series over time, so a line with a fill under it and a crosshair on hover.
// No legend: the card title names the measure.
export const AreaChart = ({
  points,
  height = 200,
  format,
  labelOf,
}: {
  points: number[];
  height?: number;
  format: (n: number) => string;
  labelOf?: (i: number) => string;
}) => {
  const [at, setAt] = useState<number | null>(null);

  if (points.length < 2) {
    return <p className="text-muted-foreground py-10 text-center text-sm select-none">Not enough history yet</p>;
  }

  const W = 600;
  const H = height;
  const pad = 6;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number): number => (i / (points.length - 1)) * W;
  const y = (v: number): number => H - pad - ((v - min) / span) * (H - pad * 2);

  const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const rising = (points[points.length - 1] ?? 0) >= (points[0] ?? 0);
  const stroke = rising ? 'var(--up)' : 'var(--down)';

  const onMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    setAt(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setAt(null)}
      >
        <defs>
          <linearGradient id="areaFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#areaFade)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {at !== null && (
          <g>
            <line x1={x(at)} y1="0" x2={x(at)} y2={H} stroke="currentColor" strokeWidth="1" opacity="0.25" />
            <circle cx={x(at)} cy={y(points[at]!)} r="4" fill={stroke} stroke="var(--card)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {at !== null && (
        <div className="bg-popover text-popover-foreground pointer-events-none absolute top-2 left-2 rounded-lg border px-3 py-1.5 text-xs shadow-lg">
          {labelOf && <div className="text-muted-foreground">{labelOf(at)}</div>}
          <div className="tabular font-semibold">{format(points[at]!)}</div>
        </div>
      )}
    </div>
  );
};
