/**
 * What each pool flag actually means.
 *
 * A flag is information, not a verdict. Most of these describe pools people
 * deliberately provide liquidity to - a 5% fee memecoin pool is where the yield
 * is - so the copy says what the risk is and lets the reader decide. Only the
 * ones that mean "you will not get your money back" are treated as blocking.
 */

export type Severity = 'blocking' | 'warning' | 'info';

export interface FlagInfo {
  label: string;
  severity: Severity;
  /** Drawn in place of the severity icon when a flag has a symbol of its own. */
  emoji?: string;
  what: string;
  why: string;
}

export const FLAGS: Record<string, FlagInfo> = {
  HONEYPOT: {
    label: 'Honeypot',
    severity: 'blocking',
    what: 'A test sell came back with far less than the pool says it charges.',
    why: 'This is the shape of a pool you can buy into and cannot get out of. Providing liquidity here means handing over the deposit.',
  },
  CANNOT_SELL: {
    label: 'Cannot sell',
    severity: 'blocking',
    what: 'A test sell reverted outright.',
    why: 'Either the token blocks selling, or nothing is on the other side. Your exit does not exist.',
  },
  EXTREME_FEE: {
    label: 'Extreme fee',
    severity: 'blocking',
    what: 'The pool charges 25% or more per swap.',
    why: 'No honest pool charges this. It is usually a tax dressed up as a fee.',
  },
  SELL_TAX: {
    label: 'Sell tax',
    severity: 'warning',
    what: 'Selling returns noticeably less than the stated fee explains.',
    why: 'The token takes a cut on the way out. Your exit is worth less than the chart says.',
  },
  BUY_TAX: {
    label: 'Buy tax',
    severity: 'warning',
    what: 'Buying costs more than the stated fee explains.',
    why: 'Less of your deposit reaches the position than you put in.',
  },
  ASYMMETRIC: {
    label: 'Asymmetric',
    severity: 'warning',
    what: 'Buying and selling are taxed differently.',
    why: 'Often deliberate: cheap to enter, expensive to leave.',
  },
  HOOK: {
    label: 'Hook',
    // Information, not a warning: the deepest pools here are hooked, and an
    // amber triangle on them put people off pools that were fine.
    severity: 'info',
    what: 'A v4 hook contract runs on every swap in this pool.',
    why: 'Hooks are normal on this chain and many are harmless - launchpads use them for fees and limits. But the contract can change what a swap does, and it is not audited by anyone here. The deepest pools are often hooked ones.',
  },
  DYNAMIC_FEE: {
    label: 'Dynamic fee',
    severity: 'warning',
    what: 'The hook sets the fee per swap rather than the pool declaring one.',
    why: 'The fee you earn, and the fee you pay to exit, can change without warning.',
  },
  HIGH_FEE: {
    label: 'High fee',
    severity: 'info',
    what: 'The pool charges 10% or more per swap.',
    why: 'Not a red flag by itself - volatile pools legitimately run high, and that is exactly where the LP yield comes from. It does mean every entry and exit costs you that much.',
  },
  THIN: {
    label: 'Thin',
    severity: 'info',
    what: 'Less than $5,000 of liquidity in the pool.',
    why: 'Your own deposit will move the price, and so will anyone else leaving. Fine for a small position, painful for a large one.',
  },
  NO_VOLUME: {
    label: 'No volume',
    severity: 'info',
    what: 'Nothing traded here in the last 24 hours.',
    why: 'Fees come from swaps. No swaps, no fees, however good the range looks.',
  },
  PROBE_FAILED: {
    label: 'Unverified',
    severity: 'warning',
    what: 'The buy/sell test could not complete.',
    why: 'Usually the RPC rather than the pool: the sell side is simply unknown. It is not evidence of a trap, and it is not evidence against one.',
  },
};

export const flagInfo = (flag: string): FlagInfo =>
  FLAGS[flag] ?? {
    label: flag.replace(/_/g, ' ').toLowerCase(),
    severity: 'info',
    what: 'No description for this flag yet.',
    why: '',
  };

/**
 * The badges worth putting on screen.
 *
 * Thin, no volume and high fee only restate the TVL, 24h and fee columns
 * sitting beside them, and a row of five badges on every pool reads as danger
 * rather than as information - which made people hesitate over pools that were
 * simply small. What stays is what the columns cannot say: the sell side is
 * taxed, blocked, hook-controlled, or was never verifiable.
 */
const QUIET: ReadonlySet<string> = new Set(['THIN', 'NO_VOLUME', 'HIGH_FEE', 'DYNAMIC_FEE']);

export const loudFlags = (flags: string[]): string[] => flags.filter((f) => !QUIET.has(f));

export const worstOf = (flags: string[]): Severity =>
  flags.some((f) => flagInfo(f).severity === 'blocking')
    ? 'blocking'
    : flags.some((f) => flagInfo(f).severity === 'warning')
      ? 'warning'
      : 'info';
