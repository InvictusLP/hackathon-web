'use client';

import type { PriceAxisTickContext } from '@luxalgo/vela';
import { type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** How the chart's price pane maps prices to its height: the y of its highest and lowest visible price. */
export type Scale = { max: number; min: number; top: number; bottom: number; log: boolean; height: number };

/** The scale of a price pane as the chart's axis reports it, or `current` when nothing in it changed. */
export const scaleFrom = (context: PriceAxisTickContext, current: Scale | null): Scale => {
  const next = {
    max: context.max,
    min: context.min,
    top: context.priceToY(context.max),
    bottom: context.priceToY(context.min),
    log: context.log,
    height: context.height,
  };
  return current && (Object.keys(next) as (keyof Scale)[]).every((key) => current[key] === next[key]) ? current : next;
};

/** A price's y in the pane, and back, between the two prices the axis gave, on its log or linear scale. */
export const along = (scale: Scale) => {
  const f = (price: number) => (scale.log ? Math.log(Math.max(price, 1e-30)) : price);
  const span = f(scale.max) - f(scale.min) || 1;
  return {
    y: (price: number) => scale.bottom + ((f(price) - f(scale.min)) / span) * (scale.top - scale.bottom),
    price: (y: number) => {
      const value = f(scale.min) + ((y - scale.bottom) / (scale.top - scale.bottom || 1)) * span;
      return scale.log ? Math.exp(value) : value;
    },
  };
};

const KEYS: Record<string, number> = { ArrowUp: 0.001, ArrowDown: -0.001, PageUp: 0.01, PageDown: -0.01 };
const EDGE = 10;

type RangeBandProps = {
  host: RefObject<HTMLDivElement | null>;
  scale: Scale;
  range: { low: number; high: number };
  formatValue: (value: number) => string;
  onEdge?: (edge: 'low' | 'high', price: number) => void;
  onCommit?: (edge: 'low' | 'high', price: number) => void;
  onDragging?: (dragging: boolean) => void;
};

/** The price pane's place in the chart: its canvas, where the library draws the pane and its axis. */
export function usePaneFrame(host: RefObject<HTMLDivElement | null>) {
  const [frame, setFrame] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {
      const canvas = element.querySelector('canvas');
      if (!canvas) return setFrame(null);
      const outer = element.getBoundingClientRect();
      const inner = canvas.getBoundingClientRect();
      setFrame({ left: inner.left - outer.left, top: inner.top - outer.top, width: inner.width });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [host]);
  return frame;
}

/**
 * Interactive range overlay drawn over Vela's price pane with draggable Min / Max handles.
 */
export function RangeBand({ host, scale, range, formatValue, onEdge, onCommit, onDragging }: RangeBandProps) {
  const frame = usePaneFrame(host);
  const [held, setHeld] = useState<'low' | 'high' | null>(null);
  const [draft, setDraft] = useState<{ low: number; high: number } | null>(null);
  if (!frame || !(range.low > 0) || !(range.high > 0)) return null;

  const activeRange = draft ?? range;
  const map = along(scale);
  const clamp = (y: number) => Math.max(EDGE, Math.min(scale.height - EDGE, y));
  const highY = clamp(map.y(activeRange.high));
  const lowY = clamp(map.y(activeRange.low));
  const interactive = Boolean(onEdge || onCommit);

  const priceAt = (clientY: number) => {
    const rect = host.current?.getBoundingClientRect();
    return rect ? map.price(clientY - rect.top - frame.top) : null;
  };

  const grab = (edge: 'low' | 'high') => (event: PointerEvent<HTMLButtonElement>) => {
    if (!interactive) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    setHeld(edge);
    setDraft({ low: range.low, high: range.high });
    onDragging?.(true);
  };

  const follow = (edge: 'low' | 'high') => (event: PointerEvent<HTMLButtonElement>) => {
    if (held !== edge) return;
    const price = priceAt(event.clientY);
    if (price !== null && price > 0) {
      setDraft((prev) => {
        const base = prev ?? range;
        return edge === 'low'
          ? { low: Math.min(price, base.high * 0.9999), high: base.high }
          : { low: base.low, high: Math.max(price, base.low * 1.0001) };
      });
      onEdge?.(edge, price);
    }
  };

  const release = (edge: 'low' | 'high') => (event: PointerEvent<HTMLButtonElement>) => {
    if (held !== edge) return;
    const price = priceAt(event.clientY);
    const finalPrice = price !== null && price > 0 ? price : activeRange[edge];
    setHeld(null);
    setDraft(null);
    onDragging?.(false);
    onCommit?.(edge, finalPrice);
  };

  const nudge = (edge: 'low' | 'high') => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!interactive) return;
    const step = KEYS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = activeRange[edge] * (1 + step);
    onEdge?.(edge, next);
    onCommit?.(edge, next);
  };

  return (
    <div
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
      <div
        className="absolute inset-x-0 border-y border-emerald-500/70 bg-emerald-500/10"
        style={{ top: `${Math.min(highY, lowY)}px`, height: `${Math.max(1, Math.abs(lowY - highY))}px` }}
      />
      {(['high', 'low'] as const).map((edge) => {
        const y = edge === 'high' ? highY : lowY;
        const isHigh = edge === 'high';
        return (
          <button
            key={edge}
            type="button"
            role="slider"
            aria-label={isHigh ? 'Max price' : 'Min price'}
            aria-orientation="vertical"
            aria-valuenow={activeRange[edge]}
            aria-valuetext={formatValue(activeRange[edge])}
            onPointerDown={grab(edge)}
            onPointerMove={follow(edge)}
            onPointerUp={release(edge)}
            onPointerCancel={release(edge)}
            onKeyDown={nudge(edge)}
            className={cn(
              'pointer-events-auto absolute right-1 -translate-y-1/2 flex h-5 items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/90 px-2 text-[10px] font-semibold text-zinc-950 shadow-xs transition-transform',
              interactive ? 'cursor-ns-resize hover:scale-105' : 'cursor-default',
              held === edge && 'ring-2 ring-emerald-300',
            )}
            style={{ top: `${y}px` }}
          >
            <span>{isHigh ? 'MAX' : 'MIN'}</span>
            <span className="font-mono">{formatValue(activeRange[edge])}</span>
          </button>
        );
      })}
    </div>
  );
}
