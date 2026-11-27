'use client';

import type { CSSProperties, RefObject } from 'react';
import { cn } from '@/lib/utils';
import { along, type Scale, usePaneFrame } from './range-band';

export type PositionMark = {
  id: string;
  low: number;
  high: number;
  color?: string;
  label?: string;
};

const EDGE = 10;

/**
 * Renders the user's open positions over Vela's price pane without interfering with pan/zoom.
 */
export function ChartMarks({
  host,
  scale,
  positions,
}: {
  host: RefObject<HTMLDivElement | null>;
  scale: Scale;
  positions: readonly PositionMark[];
}) {
  const frame = usePaneFrame(host);
  if (!frame || positions.length === 0) return null;
  const map = along(scale);
  const clamp = (y: number) => Math.max(EDGE, Math.min(scale.height - EDGE, y));

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-10 overflow-hidden"
      style={
        {
          left: `${frame.left}px`,
          top: `${frame.top}px`,
          width: `${frame.width}px`,
          height: `${scale.height}px`,
        } as CSSProperties
      }
    >
      {positions.map((position, index) => {
        if (!(position.low > 0) || !(position.high > 0)) return null;
        const top = clamp(map.y(position.high));
        const bottom = clamp(map.y(position.low));
        const color = position.color || '#06b6d4';
        return (
          <div
            key={position.id}
            className="absolute inset-x-0 border-y border-dashed"
            style={{
              top: `${Math.min(top, bottom)}px`,
              height: `${Math.max(1, Math.abs(bottom - top))}px`,
              borderColor: color,
              backgroundColor: `${color}14`,
            }}
          >
            <span
              className={cn('absolute top-1 left-2 text-[10px] font-medium')}
              style={{ color }}
            >
              {position.label || `Position ${index + 1}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
