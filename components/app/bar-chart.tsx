'use client';

import { useState, type ReactNode } from 'react';

// Discrete buckets, not a continuous signal, so bars rather than a line.
export const BarChart = <T,>({
  rows,
  valueOf,
  tooltip,
  height = 190,
  axis,
}: {
  rows: T[];
  valueOf: (row: T) => number;
  tooltip: (row: T) => ReactNode;
  height?: number;
  axis?: [string, string];
}) => {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  if (!rows.length) {
    return <p className="text-muted-foreground py-10 text-center text-sm select-none">No activity yet</p>;
  }

  const max = Math.max(...rows.map(valueOf), 1e-9);
  const width = 100 / rows.length;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative" style={{ height }}>
        {rows.map((row, i) => (
          <div
            key={i}
            className="bg-chart-1 absolute bottom-0 rounded-t transition-[height] duration-200 hover:brightness-125"
            style={{
              left: `${i * width}%`,
              width: `calc(${width}% - 2px)`,
              height: `${Math.max(1.5, (valueOf(row) / max) * 100)}%`,
            }}
            onMouseEnter={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </div>
      {axis && (
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>{axis[0]}</span>
          <span>{axis[1]}</span>
        </div>
      )}
      {hover && rows[hover.i] !== undefined && (
        <div
          className="bg-popover text-popover-foreground pointer-events-none fixed z-50 rounded-lg border px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(window.innerWidth - 240, hover.x + 14), top: Math.max(8, hover.y - 96) }}
        >
          {tooltip(rows[hover.i]!)}
        </div>
      )}
    </div>
  );
};

export const PnlBarChart = <T,>({
  rows,
  valueOf,
  format,
  tooltip,
  labelOf,
  height = 210,
}: {
  rows: T[];
  valueOf: (row: T) => number;
  format: (value: number) => string;
  tooltip: (row: T) => ReactNode;
  labelOf: (row: T) => string;
  height?: number;
}) => {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  if (!rows.length) {
    return <p className="text-muted-foreground py-10 text-center text-sm select-none">No realized PnL yet</p>;
  }

  const values = rows.map(valueOf);
  const positive = values.some((value) => value > 0);
  const negative = values.some((value) => value < 0);
  const max = Math.max(...values.map((value) => Math.abs(value)), 1e-9);
  const zero = positive && negative ? 50 : positive ? 88 : 12;
  const width = 100 / rows.length;
  const barSpace = positive && negative ? 42 : 76;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative" style={{ height }} role="img" aria-label="Daily realized profit and loss chart">
        <div
          className="bg-border/80 absolute right-0 left-0 h-px"
          style={{ top: `${zero}%` }}
        />
        {rows.map((row, i) => {
          const value = valueOf(row);
          const barHeight = Math.max(1.5, (Math.abs(value) / max) * barSpace);
          const isProfit = value >= 0;
          return (
            <div
              key={i}
              className={`absolute rounded-sm transition-[height,top] duration-200 hover:brightness-125 ${
                isProfit ? 'bg-up/75' : 'bg-down/75'
              }`}
              style={{
                left: `${i * width}%`,
                width: `calc(${width}% - 3px)`,
                top: `${isProfit ? zero - barHeight : zero}%`,
                height: `${barHeight}%`,
              }}
              onMouseEnter={(event) => setHover({ i, x: event.clientX, y: event.clientY })}
              onMouseMove={(event) => setHover({ i, x: event.clientX, y: event.clientY })}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </div>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>{labelOf(rows[0]!)}</span>
        <span className="text-foreground/70 tabular">0 baseline</span>
        <span>{labelOf(rows[rows.length - 1]!)}</span>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <i className="bg-up size-2 rounded-sm" /> Profit
        </span>
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <i className="bg-down size-2 rounded-sm" /> Loss
        </span>
      </div>
      {hover && rows[hover.i] !== undefined && (
        <div
          className="bg-popover text-popover-foreground pointer-events-none fixed z-50 rounded-lg border px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(window.innerWidth - 240, hover.x + 14), top: Math.max(8, hover.y - 100) }}
        >
          <div className="text-muted-foreground">{labelOf(rows[hover.i]!)}</div>
          <div className="tabular font-semibold">{format(valueOf(rows[hover.i]!))}</div>
          <div className="text-muted-foreground mt-1">{tooltip(rows[hover.i]!)}</div>
        </div>
      )}
    </div>
  );
};
