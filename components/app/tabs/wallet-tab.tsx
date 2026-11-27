'use client';

/**
 * WalletTab — three-panel workstation
 *
 * Left Top     Wallets table — Account, ETH Balance, Actions
 * Right Top    Quick Actions — 6 circular action tiles (3×2 responsive grid)
 * Bottom       Holdings table — Asset, Balance, Value (min 1/3 display)
 *
 * Polish & UX Improvements:
 *   - Fixed position stability: wallets maintain strict order on switch, never jump
 *   - Removed redundant "Active" badge; uses an elegant pulsing emerald status LED
 *   - Zero layout shift: names and metadata never jump horizontally
 *   - Interactive micro-feedback: 1-click address copy turns into a checkmark icon
 *   - Whole row click-to-switch with smooth emerald accent line on active row
 *   - Stopped click propagation on row actions so action clicks never accidentally switch wallets
 *   - Clean greyed-out state on pending quick actions without distracting "soon" text
 *   - Pixel-aligned table columns between headers and data rows
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpDown,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Merge,
  Pencil,
  Plus,
  ShieldAlert,
  Shuffle,
  Trash2,
  Wallet2,
} from 'lucide-react';
import { toast } from 'sonner';
import { TokenAvatar } from '@/components/app/token-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WalletSkeleton } from '@/components/app/wallet-skeleton';
import { newIdempotencyKey, post } from '@/lib/api';
import { useBlockExplorer } from '@/lib/explorer';
import { mutateFetch, walletChanged, useFetch } from '@/lib/use-live';
import { useSnapshot } from '@/components/app/live';
import { num, shortAddr, usd } from '@/lib/format';
import type { WalletChain, WalletRow, WalletSummary } from '@/lib/types';
import { useNetwork } from '@/lib/network';
import { cn } from '@/lib/utils';

const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';

// ─── Quick action definitions ──────────────────────────────────────────────────

interface ActionDef {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  soon?: boolean;
}

const ACTIONS: ActionDef[] = [
  {
    id: 'send',
    label: 'Send',
    description: 'Transfer assets from the active wallet to any address',
    icon: <ArrowUpRight className="size-5" />,
  },
  {
    id: 'receive',
    label: 'Receive',
    description: 'Copy the deposit address for the active wallet',
    icon: <ArrowDownLeft className="size-5" />,
  },
  {
    id: 'transfer',
    label: 'Transfer',
    description: 'Internal transfer between your own vaults',
    icon: <ArrowLeftRight className="size-5" />,
    soon: true,
  },
  {
    id: 'distribute',
    label: 'Distribute',
    description: 'Split and send funds from active wallet to your other vaults',
    icon: <Shuffle className="size-5" />,
    soon: true,
  },
  {
    id: 'bridge',
    label: 'Bridge',
    description: 'Bridge assets between chains',
    icon: <ArrowUpDown className="size-5" />,
    soon: true,
  },
  {
    id: 'consolidate',
    label: 'Consolidate',
    description: 'Merge dust tokens into a single asset',
    icon: <Merge className="size-5" />,
    soon: true,
  },
];

// ─── Action tile ───────────────────────────────────────────────────────────────

const ActionTile = ({
  action,
  onActivate,
  busy,
}: {
  action: ActionDef;
  onActivate: () => void;
  busy?: boolean;
}) => (
  <button
    type="button"
    title={action.description}
    aria-label={action.label}
    disabled={busy}
    onClick={() => {
      if (action.soon) {
        toast.info(`${action.label} — coming soon`);
        return;
      }
      if (!busy) onActivate();
    }}
    className={cn(
      'group flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl transition-all select-none w-full h-full',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-transparent',
      action.soon
        ? 'opacity-30 cursor-not-allowed hover:bg-transparent'
        : busy
        ? 'opacity-50 cursor-wait'
        : 'hover:bg-muted/20 hover:border-border/30 active:scale-[0.98] cursor-pointer',
    )}
  >
    <div
      className={cn(
        'flex items-center justify-center rounded-full border transition-all shrink-0',
        'size-11 sm:size-12 md:size-13',
        action.soon
          ? 'border-border/20 bg-muted/10 text-muted-foreground/60'
          : busy
          ? 'border-border/20 bg-muted/10 text-muted-foreground/60 cursor-wait'
          : 'border-border/40 bg-muted/20 text-foreground/80 group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-foreground group-hover:scale-105 shadow-2xs',
      )}
    >
      <div className="[&>svg]:size-5 sm:[&>svg]:size-5.5 md:[&>svg]:size-6">
        {action.icon}
      </div>
    </div>
    <span
      className={cn(
        'text-xs font-medium leading-none text-center truncate max-w-full',
        action.soon ? 'text-muted-foreground/50' : 'text-muted-foreground group-hover:text-foreground',
      )}
    >
      {action.label}
    </span>
  </button>
);

// ─── Inline dialogs ────────────────────────────────────────────────────────────

const RenameDialog = ({ wallet, onDone }: { wallet: WalletRow; onDone: () => void }) => {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(wallet.label ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await post('/api/wallets/rename', { address: wallet.address, label: label.trim() || 'Vault' });
      toast.success('Wallet renamed');
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rename failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="size-6 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
          title="Rename wallet"
          aria-label="Rename wallet"
        >
          <Pencil className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Rename Wallet</DialogTitle>
          <DialogDescription className="text-xs font-mono">{shortAddr(wallet.address)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="rename-lbl" className="text-xs font-medium">Label</Label>
          <Input
            id="rename-lbl"
            value={label}
            placeholder="e.g. Main Vault, Trading Vault"
            className="text-xs h-9"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RemoveDialog = ({ wallet, onDone }: { wallet: WalletRow; onDone: () => void }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await post('/api/wallets/remove', { address: wallet.address });
      toast.success('Wallet key deleted');
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove wallet');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="size-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          title="Remove wallet key"
          aria-label="Remove wallet key"
        >
          <Trash2 className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-destructive">Delete Wallet Key</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed pt-1">
            Permanently deletes the encrypted key for{' '}
            <span className="font-mono text-foreground font-medium">{shortAddr(wallet.address)}</span>.{' '}
            Ensure the wallet is empty and you have a backup.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={() => void submit()} disabled={busy}>{busy ? 'Deleting…' : 'Delete Key'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ImportDialog = ({ onDone }: { onDone: () => void }) => {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await post('/api/wallets/import', { privateKey: key.trim(), label: label.trim() || null });
      walletChanged();
      toast.success('Wallet imported and selected');
      setKey(''); setLabel(''); setOpen(false); onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setKey(''); setLabel(''); } setOpen(v); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs shadow-2xs cursor-pointer px-2.5">
          <KeyRound className="size-3.5" />
          <span>Import</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Import Wallet</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            The key is encrypted before storage and never displayed again. Paste only on a trusted device.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="pk" className="text-xs font-medium">Private Key</Label>
            <div className="relative">
              <Input
                id="pk"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="0x…"
                className="font-mono text-xs pr-8 h-9"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lbl" className="text-xs font-medium">
              Label <span className="text-muted-foreground/60 font-normal">(optional)</span>
            </Label>
            <Input
              id="lbl"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Cold Storage"
              className="text-xs h-9"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" disabled={busy || key.trim().length < 64} onClick={() => void submit()}>{busy ? 'Importing…' : 'Import & Select'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** One coin on one chain, as the holdings table and the send dialog list it. */
type HeldAsset = {
  /** `chainId:address`, unique even where two chains share a ticker or the 0x0 native address. */
  id: string;
  chainId: number;
  /** The chain's badge, only when more than one chain is on. */
  badge?: string;
  native: boolean;
  symbol: string;
  amount: number;
  usd: number;
  address?: string;
  name: string;
};

const ASSET_NAMES: Record<string, string> = {
  ETH: 'Ethereum',
  WETH: 'Wrapped Ether',
  USDG: 'Global Dollar',
  USDC: 'USD Coin',
  BNB: 'BNB',
  WBNB: 'Wrapped BNB',
  USDT: 'Tether USD',
};

// ─── Send dialog ───────────────────────────────────────────────────────────────

const SendDialog = ({
  assets,
  open,
  onClose,
  onDone,
}: {
  assets: HeldAsset[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState(assets[0]?.id ?? 'ETH');
  const [stage, setStage] = useState<'form' | 'review'>('form');
  const [busy, setBusy] = useState(false);

  // ponytail: key by chain and address (not symbol) so copy-tokens with identical tickers stay distinct,
  // and native ETH and BNB (both at 0x0) stay two assets
  const uniqueAssets = Array.from(new Map(assets.map((a) => [a.id, a])).values());
  const selected = assets.find((a) => a.id === asset) ?? assets[0];
  const validTo = /^0x[0-9a-fA-F]{40}$/.test(to.trim());
  const validAmt = amount.trim().toLowerCase() === 'all' || (Number(amount) > 0 && Number(amount) <= (selected?.amount ?? Infinity));

  const reset = () => { setTo(''); setAmount(''); setStage('form'); };

  const send = async () => {
    setBusy(true);
    try {
      await post(
        '/api/withdraw',
        {
          to: to.trim(),
          amount: amount.trim().toLowerCase() === 'all' ? 'all' : Number(amount),
          asset: selected?.symbol ?? asset,
          ...(selected?.chainId ? { chainId: selected.chainId } : {}),
        },
        newIdempotencyKey(),
      );
      toast.success('Transfer queued — approve in Telegram');
      reset();
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <ArrowUpRight className="size-4 text-primary" /> Send Assets
          </DialogTitle>
          <DialogDescription className="text-xs">
            Transfer from active wallet to any address.
          </DialogDescription>
        </DialogHeader>

        {stage === 'form' ? (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="send-to" className="text-xs font-medium">Recipient</Label>
              <Input
                id="send-to"
                value={to}
                spellCheck={false}
                placeholder="0x… destination address"
                className="font-mono text-xs h-9"
                onChange={(e) => setTo(e.target.value)}
              />
              {to.trim() && !validTo && <p className="text-xs text-destructive">Not a valid 0x address</p>}
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="send-amt" className="text-xs font-medium">Amount</Label>
                  <button
                    type="button"
                    onClick={() => setAmount('all')}
                    className="text-[10px] text-primary hover:underline cursor-pointer font-medium"
                  >
                    Max
                  </button>
                </div>
                <Input
                  id="send-amt"
                  value={amount}
                  placeholder="0.00 or all"
                  className="font-mono text-xs h-9"
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Asset</Label>
                <Select value={asset} onValueChange={setAsset}>
                  <SelectTrigger className="h-9 text-xs w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueAssets.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <TokenAvatar symbol={a.symbol} address={a.address} size="xs" />
                          {a.symbol}
                          {a.badge && <span className="text-[9px] text-muted-foreground">{a.badge}</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground/80">
              <span>
                Available:{' '}
                <span className="font-mono tabular-nums text-foreground">
                  {num(selected?.amount ?? 0)} {selected?.symbol}
                </span>
              </span>
              <span className="font-mono tabular-nums">{usd(selected?.usd ?? 0)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
              <ShieldAlert className="size-3 shrink-0" />
              Requires Telegram approval before execution
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div className="rounded-lg border border-border/40 bg-muted/10 divide-y divide-border/20">
              <div className="flex items-center justify-between px-3 py-2.5 text-xs">
                <span className="text-muted-foreground/80">Sending</span>
                <span className="font-mono tabular-nums font-semibold text-foreground">
                  {amount} {selected?.symbol ?? asset}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 px-3 py-2.5 text-xs">
                <span className="text-muted-foreground/80 shrink-0">To</span>
                <span className="font-mono text-[10px] text-foreground break-all text-right">{to.trim()}</span>
              </div>
            </div>
            <div className="flex items-start gap-1.5 text-[11px] text-amber-500/80">
              <ShieldAlert className="size-3 shrink-0 mt-0.5" />
              Sent to Telegram for approval. Once approved, this cannot be undone.
            </div>
          </div>
        )}

        <DialogFooter>
          {stage === 'form' ? (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" disabled={!validTo || !validAmt} onClick={() => setStage('review')}>
                Review
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setStage('form')} disabled={busy}>Back</Button>
              <Button size="sm" onClick={() => void send()} disabled={busy}>
                {busy ? 'Queuing…' : 'Confirm & Queue'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Receive dialog ───────────────────────────────────────────────────────────

const ReceiveDialog = ({
  address,
  open,
  onClose,
}: {
  address: string;
  open: boolean;
  onClose: () => void;
}) => {
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return;
    QRCode.toDataURL(address, {
      width: 200,
      margin: 2,
      color: { dark: '#ffffff', light: '#00000000' },
    })
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [address]);

  const copyAddress = () => {
    void navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success('Address copied');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <ArrowDownLeft className="size-4 text-primary" /> Receive
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {qrUrl && (
            <img src={qrUrl} alt="Wallet QR" className="size-[200px] rounded-lg" />
          )}
          <div className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/40 bg-muted/20">
            <span className="font-mono text-xs text-foreground truncate select-all">{address}</span>
            <button
              type="button"
              onClick={copyAddress}
              className="size-6 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors shrink-0 cursor-pointer"
              title="Copy address"
              aria-label="Copy address"
            >
              {copied ? <Check className="size-3.5 text-foreground" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Left Top: Wallets table ───────────────────────────────────────────────────

const VaultTablePanel = ({
  wallets,
  activeAddress,
  ethUsd,
  activeEthAmount,
  onMutate,
}: {
  wallets: WalletRow[];
  activeAddress: string;
  ethUsd: number;
  activeEthAmount: number;
  onMutate: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const { formatUrl } = useBlockExplorer();

  // Keep list strictly sorted by createdAt so positions never shift or rearrange
  const stableWallets = useMemo(() => {
    return [...wallets].sort((a, b) => a.createdAt - b.createdAt);
  }, [wallets]);

  const createWallet = async () => {
    setBusy(true);
    try {
      await post('/api/wallets/create', {});
      walletChanged();
      toast.success('New wallet created and selected');
      onMutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const switchWallet = async (address: string) => {
    if (address.toLowerCase() === activeAddress.toLowerCase()) return;
    setBusy(true);
    try {
      await post('/api/wallets/switch', { address });
      walletChanged();
      toast.success(`Switched to ${shortAddr(address)}`);
      onMutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Switch failed');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (address: string) => {
    setBusy(true);
    try {
      if (address.toLowerCase() !== activeAddress.toLowerCase()) {
        await post('/api/wallets/switch', { address });
      walletChanged();
      }
      await post('/api/export', {}, newIdempotencyKey());
      toast.success('Export queued — approve in Telegram to reveal key');
      onMutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = (address: string) => {
    void navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    toast.success('Address copied');
    setTimeout(() => setCopiedAddress(null), 1500);
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Sleek single top bar in grey */}
      <div className="flex items-center justify-between p-3 sm:px-4 sm:py-3 border-b border-border/40 bg-muted/20 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs tracking-tight text-foreground">Wallets</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono h-4 bg-muted/60 text-muted-foreground border border-border/40">
            {wallets.length}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <ImportDialog onDone={onMutate} />
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs shadow-2xs cursor-pointer px-2 border-border/40 hover:bg-muted/30"
            disabled={busy}
            onClick={() => void createWallet()}
          >
            <Plus className="size-3" />
            <span>New</span>
          </Button>
        </div>
      </div>

      {/* Table Column Headers — neutral monochrome matching other tables */}
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-2.5 border-b border-border/40 text-xs font-semibold text-muted-foreground shrink-0 select-none">
        <div>Account</div>
        <div className="w-28 text-right">Balance</div>
        <div className="w-36 text-right pr-1">Actions</div>
      </div>

      {/* Table Rows */}
      <div className="flex-1 overflow-y-auto min-h-0 app-scrollbar">
        {stableWallets.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-center select-none">
            <p className="text-sm text-muted-foreground">No wallets registered yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border/10">
            {stableWallets.map((w, idx) => {
              const isActive = w.address.toLowerCase() === activeAddress.toLowerCase();
              const ethBal = isActive ? (activeEthAmount > 0 ? activeEthAmount : (w.ethBalance ?? 0)) : (w.ethBalance ?? 0);
              const ethValUsd = ethBal * ethUsd;
              const accountName = w.label?.trim() || `Account ${idx + 1}`;

              return (
                <div
                  key={w.address}
                  onClick={() => !isActive && !busy && void switchWallet(w.address)}
                  className={cn(
                    'group grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-2.5 min-h-[52px] transition-colors border-l-2 select-none',
                    isActive
                      ? 'bg-white/[0.04] border-l-white dark:border-l-foreground cursor-default'
                      : 'border-l-transparent hover:bg-white/[0.02] cursor-pointer',
                  )}
                  title={isActive ? 'Active signing wallet' : 'Click to switch to this wallet'}
                >
                  {/* Account Column (Stable width, zero layout shift) */}
                  <div className="flex items-center gap-2.5 min-w-0 text-left">
                    {/* Status LED — neutral monochrome active dot */}
                    <div
                      className={cn(
                        'size-2 rounded-full shrink-0 transition-all',
                        isActive
                          ? 'bg-white dark:bg-foreground ring-2 ring-white/20 dark:ring-foreground/20 shadow-[0_0_6px_rgba(255,255,255,0.4)]'
                          : 'bg-white/20 group-hover:bg-white/40',
                      )}
                    />
                    <Wallet2
                      className={cn(
                        'size-4 shrink-0 transition-colors',
                        isActive ? 'text-foreground' : 'text-muted-foreground/50',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={cn(
                            'text-xs font-medium truncate',
                            isActive ? 'text-foreground font-semibold' : 'text-foreground/80',
                          )}
                        >
                          {accountName}
                        </span>
                        {w.imported && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 h-3.5 font-mono text-muted-foreground border-border/40 shrink-0"
                          >
                            imported
                          </Badge>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground/60 truncate">
                        {shortAddr(w.address)}
                      </div>
                    </div>
                  </div>

                  {/* ETH Balance Column */}
                  <div className="w-28 text-right select-none">
                    <div className="font-mono tabular-nums text-xs font-semibold text-foreground">
                      {num(ethBal)} <span className="text-[10px] text-muted-foreground font-normal">ETH</span>
                    </div>
                    <div className="font-mono tabular-nums text-[10px] text-muted-foreground/70">
                      {usd(ethValUsd)}
                    </div>
                  </div>

                  {/* Actions Column — stopPropagation so action clicks never accidentally switch wallet */}
                  <div
                    className="w-36 flex items-center justify-end gap-1 shrink-0 pr-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => copyAddress(w.address)}
                      className="size-6 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
                      title="Copy address"
                      aria-label="Copy address"
                    >
                      {copiedAddress === w.address ? (
                        <Check className="size-3.5 text-foreground" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>

                    <RenameDialog wallet={w} onDone={onMutate} />

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleExport(w.address)}
                      className="size-6 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer disabled:opacity-40"
                      title="Export private key via Telegram"
                      aria-label="Export private key via Telegram"
                    >
                      <Download className="size-3.5" />
                    </button>

                    <a
                      href={formatUrl(`/address/${w.address}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="size-6 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
                      title="View on explorer"
                      aria-label="View on explorer"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>

                    {stableWallets.length > 1 && !isActive ? (
                      <RemoveDialog wallet={w} onDone={onMutate} />
                    ) : (
                      <div className="size-6" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Right Top: Quick Actions ──────────────────────────────────────────────────

const CommandDeckPanel = ({
  address,
  allAssets,
  onMutate,
}: {
  address: string;
  allAssets: HeldAsset[];
  onMutate: () => void;
}) => {
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const busy = false;

  const handleActivate = (id: string) => {
    if (busy) return;
    if (id === 'send') { setSendOpen(true); return; }
    if (id === 'receive') { setReceiveOpen(true); return; }
  };

  return (
    <>
      <div className="h-full flex flex-col min-h-0">
        {/* Sleek single top bar in grey */}
        <div className="flex items-center justify-between p-3 sm:px-4 sm:py-3 border-b border-border/40 bg-muted/20 shrink-0 select-none">
          <span className="font-semibold text-xs tracking-tight text-foreground">Quick Actions</span>
        </div>

        <div className="flex-1 min-h-0 p-3 sm:p-4 overflow-auto app-scrollbar">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 h-full max-h-full items-center">
            {ACTIONS.filter((a) => !a.soon).map((a) => (
              <ActionTile key={a.id} action={a} onActivate={() => handleActivate(a.id)} busy={busy} />
            ))}
          </div>
        </div>
      </div>

      <SendDialog
        assets={allAssets}
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        onDone={onMutate}
      />
      <ReceiveDialog
        address={address}
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
      />
    </>
  );
};

// ─── Bottom: Holdings table ────────────────────────────────────────────────────

const HoldingsPanel = ({
  assets,
}: {
  assets: HeldAsset[];
}) => (
  <div className="h-full flex flex-col min-h-0">
    {/* Sleek single top bar in grey */}
    <div className="flex items-center justify-between p-3 sm:px-4 sm:py-3 border-b border-border/40 bg-muted/20 shrink-0 select-none">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-xs tracking-tight text-foreground">Holdings</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono h-4 bg-muted/60 text-muted-foreground border border-border/40">
          {assets.length}
        </Badge>
      </div>
    </div>

    {/* Table Column Headers — neutral monochrome matching other tables */}
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 px-4 sm:px-5 py-2.5 border-b border-border/40 text-xs font-semibold text-muted-foreground shrink-0 select-none">
      <div>Asset</div>
      <div className="w-32 text-right">Balance</div>
      <div className="w-32 text-right">Value</div>
    </div>

    {/* Table Rows */}
    <div className="flex-1 overflow-y-auto min-h-0 app-scrollbar">
      {assets.length === 0 ? (
        <div className="flex h-full min-h-24 items-center justify-center py-16 text-center select-none">
          <p className="text-sm text-muted-foreground">No assets in this wallet</p>
        </div>
      ) : (
        <div className="divide-y divide-border/10">
          {assets.map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 px-4 sm:px-5 py-2.5 hover:bg-muted/10 transition-colors min-h-[46px]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <TokenAvatar symbol={a.symbol} address={a.address} size="sm" />
                <div className="min-w-0 truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground truncate">{a.symbol}</span>
                    {a.native && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/40 leading-none">
                        Native
                      </span>
                    )}
                    {a.badge && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/40 leading-none">
                        {a.badge}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground/70 truncate">{a.name}</div>
                </div>
              </div>
              <div className="w-32 text-right font-mono tabular-nums text-xs text-foreground font-medium">
                {num(a.amount)}
              </div>
              <div className="w-32 text-right font-mono tabular-nums text-xs text-muted-foreground">
                {usd(a.usd)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

// ─── Root page ─────────────────────────────────────────────────────────────────

const WalletPage = ({ isActive: _isActive = true }: { isActive?: boolean }) => {
  const { data, error, reload } = useFetch<WalletSummary>('/api/wallet');
  const snap = useSnapshot();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const handleMutate = useCallback(() => {
    mutateFetch();
  }, []);

  const wallets = useMemo(() => {
    const base = data?.wallets ?? snap?.wallets ?? [];
    if (!snap?.wallets || !data?.wallets) return base;
    return base.map((w) => {
      const liveW = snap.wallets?.find((sw) => sw.address.toLowerCase() === w.address.toLowerCase());
      return liveW?.ethBalance !== undefined ? { ...w, ethBalance: liveW.ethBalance } : w;
    });
  }, [data?.wallets, snap?.wallets]);

  const { inNetwork } = useNetwork();
  const activeEthAmount = data?.assets?.find((a) => a.symbol === 'ETH')?.amount ?? snap?.wallet?.eth ?? 0;

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center select-none py-16 space-y-2">
        <p className="text-sm text-muted-foreground">Failed to load wallet ({error})</p>
        <Button variant="outline" size="sm" onClick={reload} className="h-7 text-xs cursor-pointer">
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return <WalletSkeleton />;

  // Every enabled chain's coins, or the selected network's alone. A Robinhood-only bot lists exactly what it did before, untagged.
  const everyChain: WalletChain[] = data.chains?.length
    ? data.chains
    : [{ chainId: 4663, badge: 'RH', name: 'Robinhood Chain', assets: data.assets ?? [], totalUsd: null }];
  const scoped = everyChain.filter((c) => inNetwork(c.chainId));
  const chainList = scoped.length ? scoped : everyChain;
  const multiChain = chainList.length > 1;
  const badgeOf = (chainId?: number): string | undefined =>
    multiChain ? chainList.find((c) => c.chainId === (chainId ?? 4663))?.badge : undefined;
  const allAssets: HeldAsset[] = [
    ...chainList.flatMap((c) =>
      c.assets
        // The gas token always shows on Robinhood; elsewhere only when held.
        .filter((a) => (c.chainId === 4663 && a.symbol === 'ETH') || a.amount > 0)
        .map((a) => {
          const native = !a.address;
          const address = a.address ?? (native ? '0x0000000000000000000000000000000000000000' : a.symbol === 'WETH' ? WETH : undefined);
          return {
            id: `${c.chainId}:${(address ?? a.symbol).toLowerCase()}`,
            chainId: c.chainId,
            badge: badgeOf(c.chainId),
            native,
            symbol: a.symbol,
            amount: a.amount,
            usd: a.usd,
            address,
            name: ASSET_NAMES[a.symbol] ?? a.symbol,
          };
        }),
    ),
    ...(data.tokens ?? []).filter((t) => t.amount > 0 && chainList.some((c) => c.chainId === (t.chainId ?? 4663))).map((t) => ({
      id: `${t.chainId ?? 4663}:${(t.address ?? t.symbol).toLowerCase()}`,
      chainId: t.chainId ?? 4663,
      badge: badgeOf(t.chainId),
      native: false,
      symbol: t.symbol,
      amount: t.amount,
      usd: t.usd,
      address: t.address ?? undefined,
      name: t.symbol,
    })),
  ];

  // ── Desktop — 3-panel workstation with percentage drag bounds ────────────────

  if (isDesktop) {
    return (
      <div className="w-full flex-1 flex flex-col min-h-0">
        <div className="rounded-xl border border-border/70 bg-card/50 shadow-xs overflow-hidden flex-1 flex flex-col min-h-[calc(100svh-12rem)]">
          <ResizablePanelGroup orientation="vertical" className="h-full w-full min-h-0 flex-1">

            {/* Top row */}
            <ResizablePanel defaultSize="52%" minSize="35%" maxSize="67%" className="min-h-0 overflow-hidden">
              <ResizablePanelGroup orientation="horizontal" className="h-full w-full min-h-0">

                {/* Left: Wallets table panel */}
                <ResizablePanel defaultSize="58%" minSize="35%" maxSize="70%" className="min-h-0 overflow-hidden">
                  <VaultTablePanel
                    wallets={wallets}
                    activeAddress={data.address}
                    ethUsd={data.ethUsd || 0}
                    activeEthAmount={activeEthAmount}
                    onMutate={handleMutate}
                  />
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Right: Quick actions */}
                <ResizablePanel defaultSize="42%" minSize="30%" maxSize="65%" className="min-h-0 overflow-hidden">
                  <CommandDeckPanel address={data.address} allAssets={allAssets} onMutate={handleMutate} />
                </ResizablePanel>

              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle withHandle orientation="vertical" />

            {/* Bottom: Holdings — min 33% (minimum 1/3 display) */}
            <ResizablePanel defaultSize="48%" minSize="33%" maxSize="65%" className="min-h-0 overflow-hidden">
              <HoldingsPanel assets={allAssets} />
            </ResizablePanel>

          </ResizablePanelGroup>
        </div>
      </div>
    );
  }

  // ── Mobile — stacked cards ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 w-full flex-1">
      <div className="rounded-xl border border-border/70 bg-card/50 shadow-xs overflow-hidden">
        <VaultTablePanel
          wallets={wallets}
          activeAddress={data.address}
          ethUsd={data.ethUsd || 0}
          activeEthAmount={activeEthAmount}
          onMutate={handleMutate}
        />
      </div>
      <div className="rounded-xl border border-border/70 bg-card/50 shadow-xs overflow-hidden" style={{ minHeight: '220px' }}>
        <CommandDeckPanel address={data.address} allAssets={allAssets} onMutate={handleMutate} />
      </div>
      <div className="rounded-xl border border-border/70 bg-card/50 shadow-xs overflow-hidden min-h-[300px]">
        <HoldingsPanel assets={allAssets} />
      </div>
    </div>
  );
};

export const WalletTab = ({ isActive = true }: { isActive?: boolean }) => (
  <Suspense fallback={<WalletSkeleton />}>
    <WalletPage isActive={isActive} />
  </Suspense>
);
