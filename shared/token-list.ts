/**
 * Canonical Token Lists (https://tokenlists.org/) & jsDelivr CDN Resolver.
 *
 * Implements standard Uniswap Token List schema with jsDelivr multi-CDN edge delivery.
 * Resolution precedence:
 * 1. Curated Token List (tokenlists.org schema, served via jsDelivr CDN or local static)
 * 2. Multi-chain asset repository via jsDelivr CDN (TrustWallet / Smoldapp assets)
 * 3. DexScreener dynamic fallback for newly deployed / unlisted tokens
 */

import { getAddress, isAddress } from 'viem';

export interface TokenInfo {
  readonly chainId: number;
  readonly address: string;
  readonly name: string;
  readonly decimals: number;
  readonly symbol: string;
  readonly logoURI?: string;
  readonly tags?: string[];
  readonly extensions?: Record<string, unknown>;
}

export interface TokenList {
  readonly name: string;
  readonly timestamp: string;
  readonly version: {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
  };
  readonly keywords?: string[];
  readonly logoURI?: string;
  readonly tokens: TokenInfo[];
}

import TOKEN_LIST_JSON from './tokenlist.json';

export const INVICTUS_TOKEN_LIST: TokenList = TOKEN_LIST_JSON as TokenList;

// Pre-indexed lookup maps for 0ms synchronous resolution
const tokenByAddress = new Map<string, TokenInfo>();
const tokenBySymbol = new Map<string, TokenInfo>();

for (const token of INVICTUS_TOKEN_LIST.tokens) {
  const normAddr = token.address.toLowerCase();
  tokenByAddress.set(normAddr, token);
  tokenByAddress.set(`${token.chainId}:${normAddr}`, token);
  tokenBySymbol.set(token.symbol.toUpperCase(), token);
}

/**
 * Returns a high-speed jsDelivr CDN URL for an EVM token from TrustWallet assets.
 */
export const getJsDelivrTrustWalletUrl = (
  address: string,
  blockchain = 'ethereum',
): string | null => {
  if (!isAddress(address)) return null;
  const checksum = getAddress(address);
  return `https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/${blockchain}/assets/${checksum}/logo.png`;
};

/**
 * Returns a high-speed jsDelivr CDN URL from the Smoldapp multi-chain token assets repository.
 */
export const getJsDelivrSmoldappUrl = (
  chainId: number,
  address: string,
): string | null => {
  if (!isAddress(address)) return null;
  const checksum = getAddress(address);
  return `https://cdn.jsdelivr.net/gh/smoldapp/token-assets@main/tokens/${chainId}/${checksum}/logo.png`;
};

/**
 * Resolves standard token logo according to Token Lists & jsDelivr CDN specifications.
 * Returns null if not found in tokenlist or standard CDN, triggering DexScreener fallback.
 */
export const resolveTokenListLogo = (
  address?: string | null,
  symbol?: string | null,
  chainId = 4663,
): string | null => {
  const normAddr = address ? address.trim().toLowerCase() : null;
  const cleanSym = symbol ? (symbol.includes('/') ? symbol.split('/')[0] : symbol)?.trim().toUpperCase() : null;

  // 1. Direct match in curated Token List by chainId + address
  if (normAddr) {
    const directChainMatch = tokenByAddress.get(`${chainId}:${normAddr}`);
    if (directChainMatch?.logoURI) return directChainMatch.logoURI;

    const directAddrMatch = tokenByAddress.get(normAddr);
    if (directAddrMatch?.logoURI) return directAddrMatch.logoURI;
  }

  // 2. Direct match in curated Token List by symbol (ETH, WETH, USDG, USDC)
  if (cleanSym) {
    const symMatch = tokenBySymbol.get(cleanSym);
    if (symMatch?.logoURI) return symMatch.logoURI;
  }

  return null;
};

/**
 * Resolves full TokenInfo from standard Token List.
 */
export const findTokenFromList = (
  addressOrSymbol: string,
  chainId = 4663,
): TokenInfo | null => {
  const norm = addressOrSymbol.trim().toLowerCase();
  const byChain = tokenByAddress.get(`${chainId}:${norm}`);
  if (byChain) return byChain;
  const byAddr = tokenByAddress.get(norm);
  if (byAddr) return byAddr;
  const bySym = tokenBySymbol.get(addressOrSymbol.trim().toUpperCase());
  if (bySym) return bySym;
  return null;
};

/**
 * Dynamic CoinMarketCap ID registry derived directly from canonical tokenlist extensions.
 * Eliminates redundant hardcoding and guarantees zero maintenance drift.
 */
export const CMC_TOKEN_IDS: Record<string, number> = Object.fromEntries(
  INVICTUS_TOKEN_LIST.tokens
    .filter((t) => (t.extensions as Record<string, unknown> | undefined)?.cmcId)
    .flatMap((t) => {
      const id = Number((t.extensions as Record<string, unknown>).cmcId);
      return [
        [t.symbol.toLowerCase(), id],
        [t.address.toLowerCase(), id],
      ];
    }),
);

/**
 * Resolves standard CoinMarketCap logo CDN URL.
 * Priority 1: extensions.cmcLogo or extensions.cmcId from tokenlist.json
 * Priority 2: Dynamic CMC ID lookup
 */
export const getCoinMarketCapLogoUrl = (
  addressOrSymbol?: string | null,
  chainId = 4663,
): string | null => {
  if (!addressOrSymbol) return null;
  const raw = addressOrSymbol.trim().toLowerCase();
  const cleanSym = (raw.includes('/') ? (raw.split('/')[0] ?? raw) : raw).trim();

  // 1. Check tokenlist extensions
  const token = findTokenFromList(cleanSym, chainId) || findTokenFromList(raw, chainId);
  if (token?.extensions) {
    const ext = token.extensions as Record<string, unknown>;
    if (typeof ext.cmcLogo === 'string' && ext.cmcLogo) {
      return ext.cmcLogo;
    }
    if (ext.cmcId) {
      return `https://s2.coinmarketcap.com/static/img/coins/200x200/${ext.cmcId}.png`;
    }
  }

  // 2. Dynamic CMC ID lookup
  const cmcId = CMC_TOKEN_IDS[cleanSym] ?? CMC_TOKEN_IDS[raw];
  if (cmcId) {
    return `https://s2.coinmarketcap.com/static/img/coins/200x200/${cmcId}.png`;
  }

  return null;
};

/**
 * Resolves standard DexScreener asset logo URL.
 */
export const getDexScreenerLogoUrl = (
  address?: string | null,
  chainId = 4663,
): string | null => {
  if (!address || !isAddress(address)) return null;
  const network = chainId === 5042 ? 'arc' : chainId === 56 ? 'bsc' : 'robinhood';
  return `https://dd.dexscreener.com/ds-data/tokens/${network}/${address.toLowerCase()}.png`;
};

/**
 * Resolves token logo hierarchy in strict priority order:
 * 1. CoinGecko (TokenList logoURI / GeckoTerminal)
 * 2. CoinMarketCap (200x200 CDN)
 * 3. DexScreener (dd.dexscreener.com)
 * 4. Absolute Fallback (/images/unknown.png)
 */
export const getTokenLogoHierarchy = (
  address?: string | null,
  symbol?: string | null,
  chainId = 4663,
): string[] => {
  const candidates: string[] = [];

  // 1. CoinGecko (Top Priority)
  const cgLogo = resolveTokenListLogo(address, symbol, chainId);
  if (cgLogo && !candidates.includes(cgLogo)) candidates.push(cgLogo);

  // 2. CoinMarketCap (Fallback 1)
  const cmcLogo =
    getCoinMarketCapLogoUrl(address, chainId) ||
    (symbol ? getCoinMarketCapLogoUrl(symbol, chainId) : null);
  if (cmcLogo && !candidates.includes(cmcLogo)) candidates.push(cmcLogo);

  // 3. DexScreener (Fallback 2)
  const dsLogo = getDexScreenerLogoUrl(address, chainId);
  if (dsLogo && !candidates.includes(dsLogo)) candidates.push(dsLogo);

  // 4. Absolute Fallback
  candidates.push('/images/unknown.png');

  return candidates;
};
