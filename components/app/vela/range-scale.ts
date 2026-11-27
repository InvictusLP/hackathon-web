import type { NativeIndicator, NativeIndicatorContext, NativeIndicatorDescriptor } from '@luxalgo/vela';

/** The type of the chart's native indicator that keeps the prices of the range being chosen in view. */
export const RANGE_SCALE = 'invictus-range-scale';
/**
 * The prices it holds: the two edges of the range being chosen, then the lowest and highest of the user's open
 * positions and orders in the pool (they are kept on screen too).
 */
const MOST = 4;

/**
 * Prices as the inputs of the indicator: `p0`, `p1`, ..., `0` where there is none. Inputs are flat numbers, so the
 * list travels as one key per price.
 */
export const scaleInputs = (prices: readonly number[]) =>
  Object.fromEntries(
    Array.from({ length: MOST }, (_, index) => {
      const price = prices[index];
      return [`p${index}`, price !== undefined && Number.isFinite(price) && price > 0 ? price : 0];
    }),
  );

/**
 * A native indicator that paints nothing and sits on the price scale only, with a level at each price it is given,
 * so the chart's autoscale keeps the range being chosen in view.
 */
export const rangeScale: NativeIndicatorDescriptor = {
  type: RANGE_SCALE,
  title: 'Range in view',
  paneHint: 'price',
  overlay: true,
  legend: false,
  inputsSchema: () =>
    Array.from({ length: MOST }, (_, index) => ({
      key: `p${index}`,
      title: `Price ${index}`,
      type: 'float',
      defval: 0,
    })),
  defaultInputs: () => scaleInputs([]),
  create: (): NativeIndicator => {
    let context: NativeIndicatorContext | null = null;
    let prices: number[] = [];
    const emit = () => {
      if (!context) return;
      const bars = context.bars();
      if (bars.length === 0) return context.emit({ series: [] });
      const paneId = '';
      context.emit({
        series: prices.map((price, index) => ({
          id: `${RANGE_SCALE}-${index}`,
          title: `Range ${index}`,
          paneId,
          kind: 'line' as const,
          points: bars.map((bar) => ({ time: bar.time, value: price })),
          style: { color: 'rgba(0,0,0,0)', width: 1, lineStyle: 'solid' as const },
          display: { pane: false, priceScale: true, legend: false, dataWindow: false },
        })),
      });
    };
    const read = (inputs: Record<string, unknown>) => {
      prices = Object.values(inputs).filter((value): value is number => typeof value === 'number' && value > 0);
    };
    return {
      start: (ctx, inputs) => {
        context = ctx;
        read(inputs);
        emit();
      },
      onBars: emit,
      onViewport: () => {},
      setInputs: (inputs) => {
        read(inputs);
        emit();
      },
      suspend: () => {},
      resume: emit,
      stop: () => {
        context = null;
      },
    };
  },
};
