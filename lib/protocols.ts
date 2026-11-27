export interface ProtocolMeta {
  id: string;
  name: string;
  iconUrl: string;
  defillamaSlug?: string;
}

export const PROTOCOL_REGISTRY: Record<string, ProtocolMeta> = {
  uniswap: {
    id: 'uniswap',
    name: 'Uniswap',
    iconUrl: '/protocols/uniswap.png',
  },
  ramses: {
    id: 'ramses',
    name: 'Ramses',
    iconUrl: '/protocols/ramses.png',
    defillamaSlug: 'ramses-exchange',
  },
  camelot: {
    id: 'camelot',
    name: 'Camelot',
    iconUrl: '/protocols/camelot.png',
  },
  sushiswap: {
    id: 'sushiswap',
    name: 'SushiSwap',
    iconUrl: '/protocols/sushiswap.png',
  },
  sushi: {
    id: 'sushiswap',
    name: 'SushiSwap',
    iconUrl: '/protocols/sushiswap.png',
  },
  pancakeswap: {
    id: 'pancakeswap',
    name: 'PancakeSwap',
    iconUrl: '/protocols/pancakeswap.png',
  },
  curve: {
    id: 'curve',
    name: 'Curve',
    iconUrl: '/protocols/curve.png',
  },
  balancer: {
    id: 'balancer',
    name: 'Balancer',
    iconUrl: '/protocols/balancer.png',
  },
  aerodrome: {
    id: 'aerodrome',
    name: 'Aerodrome',
    iconUrl: '/protocols/aerodrome.png',
  },
  pumpswap: {
    id: 'pumpswap',
    name: 'PumpSwap',
    iconUrl: '/protocols/pumpswap.png',
  },
  raydium: {
    id: 'raydium',
    name: 'Raydium',
    iconUrl: '/protocols/raydium.png',
  },
};

export interface ParsedProtocol {
  id: string;
  name: string;
  version: 'v3' | 'v4' | string;
  displayName: string;
  slug: string;
  iconUrl: string;
  defillamaSlug?: string;
}

/**
 * Trims and parses protocol string (e.g. "uniswap_v4", "ramses_v3", "uniswap")
 * and extracts protocol id, human-readable name, and version cleanly.
 */
export function parseProtocol(
  protocolParam?: string | null,
  fallbackVersion?: string | null,
): ParsedProtocol {
  const raw = (protocolParam || '').trim().toLowerCase();

  let protoKey = 'uniswap';
  let verKey = (fallbackVersion || '').toLowerCase();

  if (raw === 'v3' || raw === 'v4') {
    protoKey = 'uniswap';
    verKey = raw;
  } else if (raw.includes('_')) {
    const parts = raw.split('_');
    protoKey = parts[0] || 'uniswap';
    verKey = parts.slice(1).join('_');
  } else if (raw.includes('-')) {
    const parts = raw.split('-');
    protoKey = parts[0] || 'uniswap';
    verKey = parts.slice(1).join('-');
  } else if (raw) {
    protoKey = raw;
  }

  // Normalize known protocol keys
  if (protoKey === 'sushi') protoKey = 'sushiswap';
  if (protoKey === 'pancake') protoKey = 'pancakeswap';
  if (protoKey === 'v3' || protoKey === 'v4') {
    verKey = protoKey;
    protoKey = 'uniswap';
  }

  // Normalize version
  if (!verKey) {
    verKey = fallbackVersion?.toLowerCase() || 'v4';
  }
  if (!verKey.startsWith('v') && /^\d+$/.test(verKey)) {
    verKey = `v${verKey}`;
  }

  const meta = PROTOCOL_REGISTRY[protoKey] || {
    id: protoKey,
    name: protoKey.charAt(0).toUpperCase() + protoKey.slice(1),
    iconUrl: protoKey === 'uniswap' ? '/protocols/uniswap.png' : `/protocols/${protoKey}.png`,
  };

  const verFormatted = verKey.toUpperCase();
  const displayName = `${meta.name} ${verFormatted}`;
  const slug = `${meta.id}_${verKey.toLowerCase()}`;

  return {
    id: meta.id,
    name: meta.name,
    version: verKey.toLowerCase(),
    displayName,
    slug,
    iconUrl: meta.iconUrl,
    defillamaSlug: meta.defillamaSlug || meta.id,
  };
}

/**
 * Formats protocol query string slug (e.g. "uniswap_v4", "ramses_v3")
 */
export function formatProtocolSlug(
  protocolOrDex?: string | null,
  version?: string | null,
): string {
  const p = parseProtocol(protocolOrDex, version);
  return p.slug;
}

/**
 * Maps chain id or name to protocol-compatible network slug.
 * Supported chains: Robinhood Chain (4663), Ethereum (1), Base (8453), Arbitrum (42161),
 * Optimism (10), Polygon (137), BNB (56), Avalanche (43114), Blast (81457), Celo (42220), etc.
 */
export function resolveChainSlug(chain?: string | number | null): string {
  if (chain === undefined || chain === null || chain === '') return 'robinhood';
  if (typeof chain === 'number' || (!isNaN(Number(chain)) && typeof chain === 'string' && /^\d+$/.test(chain.trim()))) {
    const id = Number(chain);
    switch (id) {
      case 4663:
        return 'robinhood';
      case 1:
        return 'ethereum';
      case 8453:
        return 'base';
      case 42161:
        return 'arbitrum';
      case 10:
        return 'optimism';
      case 137:
        return 'polygon';
      case 56:
        return 'bnb';
      case 43114:
        return 'avalanche';
      case 81457:
        return 'blast';
      case 42220:
        return 'celo';
      case 5042:
        return 'arc';
      case 7777777:
        return 'zora';
      default:
        return 'robinhood';
    }
  }
  const s = String(chain).trim().toLowerCase();
  return s || 'robinhood';
}

/** The chains the Invictus backend LPs on: Robinhood, Arc and BNB Chain. */
export const BOT_CHAIN_IDS: readonly number[] = [4663, 5042, 56];

export function resolveChainId(chain?: string | number | null): number {
  if (!chain) return 4663;
  if (typeof chain === 'number') return chain;
  const s = String(chain).trim().toLowerCase();
  switch (s) {
    case 'arc':
    case '5042':
      return 5042;
    case 'bnb':
    case 'bsc':
    case 'binance':
    case '56':
      return 56;
    case 'base':
    case '8453':
      return 8453;
    case 'ethereum':
    case 'mainnet':
    case '1':
      return 1;
    case 'arbitrum':
    case '42161':
      return 42161;
    case 'robinhood':
    case '4663':
      return 4663;
    default: {
      const num = Number(s);
      return Number.isFinite(num) && num > 0 ? num : 4663;
    }
  }
}

export interface FundingAssetOption {
  id: string;
  symbol: string;
  name: string;
  iconSrc?: string;
  isNative?: boolean;
  isStable?: boolean;
}

/**
 * Returns recommended single-asset funding options for a given chain.
 * LPs frequently hold native or primary stable assets instead of the pair's exact tokens,
 * so the workstation offers dynamic one-click funding options with automated Zap/wrap routing.
 */
export function getChainFundingOptions(chain?: string | number | null): FundingAssetOption[] {
  const slug = resolveChainSlug(chain);
  switch (slug) {
    case 'arc':
      return [
        { id: 'usdc', symbol: 'USDC', name: 'USD Coin', iconSrc: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png', isNative: true, isStable: true },
      ];
    case 'solana':
    case 'sol':
      return [
        { id: 'sol', symbol: 'SOL', name: 'Solana', iconSrc: '/tokens/sol.png', isNative: true, isStable: false },
        { id: 'usdc', symbol: 'USDC', name: 'USD Coin', iconSrc: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png', isNative: false, isStable: true },
      ];
    case 'base':
    case 'arbitrum':
    case 'ethereum':
    case 'optimism':
    case 'zora':
      return [
        { id: 'eth', symbol: 'ETH', name: 'Ethereum', iconSrc: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png', isNative: true, isStable: false },
        { id: 'usdc', symbol: 'USDC', name: 'USD Coin', iconSrc: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png', isNative: false, isStable: true },
      ];
    case 'blast':
      return [
        { id: 'eth', symbol: 'ETH', name: 'Ethereum', iconSrc: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png', isNative: true, isStable: false },
        { id: 'usdb', symbol: 'USDB', name: 'USD Blast', iconSrc: '/tokens/usdb.png', isNative: false, isStable: true },
      ];
    case 'polygon':
      return [
        { id: 'pol', symbol: 'POL', name: 'Polygon', iconSrc: '/tokens/pol.png', isNative: true, isStable: false },
        { id: 'usdc', symbol: 'USDC', name: 'USD Coin', iconSrc: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png', isNative: false, isStable: true },
      ];
    case 'bnb':
    case 'bsc':
      return [
        { id: 'eth', symbol: 'BNB', name: 'BNB', iconSrc: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png', isNative: true, isStable: false },
        { id: 'usdt', symbol: 'USDT', name: 'Tether USD', iconSrc: 'https://assets.coingecko.com/coins/images/325/large/Tether.png', isNative: false, isStable: true },
      ];
    case 'robinhood':
    default:
      return [
        { id: 'eth', symbol: 'ETH', name: 'Ethereum', iconSrc: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png', isNative: true, isStable: false },
        { id: 'usdg', symbol: 'USDG', name: 'USD Global', iconSrc: 'https://coin-images.coingecko.com/coins/images/51281/large/GDN_USDG_Token_200x200.png?1730484111', isNative: false, isStable: true },
      ];
  }
}

/**
 * Resolves the external pool URL on the protocol's native decentralized app / platform.
 * Example for Uniswap on Robinhood Chain:
 * - v3 (42-char address): https://app.uniswap.org/explore/pools/robinhood/0x10cc6bd38112cac182db90b6a71d8bb5939526ba
 * - v4 (66-char poolId):  https://app.uniswap.org/explore/pools/robinhood/0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a
 */
export function getProtocolPoolUrl(
  protocolOrDex?: string | null,
  poolId?: string | null,
  chain?: string | number | null,
): string {
  if (!poolId) return '';
  const parsed = parseProtocol(protocolOrDex);
  const chainSlug = resolveChainSlug(chain);
  const normalizedId = poolId.trim().toLowerCase();

  switch (parsed.id) {
    case 'uniswap':
      return `https://app.uniswap.org/explore/pools/${chainSlug}/${normalizedId}`;
    case 'sushiswap':
      return `https://www.sushi.com/pool/${chainSlug}:${normalizedId}`;
    case 'pancakeswap': {
      const cakeChain = chainSlug === 'bnb' ? 'bsc' : chainSlug;
      return `https://pancakeswap.finance/info/v3/${cakeChain}/pairs/${normalizedId}`;
    }
    case 'ramses':
      return `https://app.ramses.exchange/liquidity/${normalizedId}`;
    case 'camelot':
      return `https://app.camelot.exchange/liquidity/${normalizedId}`;
    case 'aerodrome':
      return `https://aerodrome.finance/pools`;
    case 'curve':
      return `https://curve.fi/#/${chainSlug}/pools`;
    case 'balancer':
      return `https://balancer.fi/pools/${normalizedId}`;
    default:
      return `https://app.uniswap.org/explore/pools/${chainSlug}/${normalizedId}`;
  }
}

