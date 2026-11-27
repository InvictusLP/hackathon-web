'use client';

import { useState } from 'react';
import {
  Check,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  Trash2,
  Wallet2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { post } from '@/lib/api';
import { mutateFetch, walletChanged } from '@/lib/use-live';
import { shortAddr } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { WalletRow } from '@/lib/types';

/**
 * Every wallet on this account, and which one signs.
 *
 * Switching is a server-side flag rather than browser state: the bot signs with
 * the same wallet the site is showing, so the two surfaces can never disagree
 * about where a transaction is coming from.
 */
export const WalletSwitcher = ({
  wallets,
  onChange,
}: {
  wallets: WalletRow[];
  onChange: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  // Rename state
  const [renamingWallet, setRenamingWallet] = useState<WalletRow | null>(null);
  const [newLabel, setNewLabel] = useState('');

  const call = async (path: string, body: unknown, ok: string): Promise<boolean> => {
    setBusy(true);
    try {
      await post(path, body);
      toast.success(ok);
      if (['/api/wallets/switch', '/api/wallets/create', '/api/wallets/import'].includes(path)) walletChanged();
      else mutateFetch();
      onChange();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (): Promise<void> => {
    if (!renamingWallet) return;
    const ok = await call(
      '/api/wallets/rename',
      { address: renamingWallet.address, label: newLabel.trim() || 'Wallet' },
      'Wallet renamed',
    );
    if (ok) {
      setRenamingWallet(null);
      setNewLabel('');
    }
  };

  return (
    <>
      {/* Rename Wallet Dialog */}
      <Dialog open={renamingWallet !== null} onOpenChange={(open) => !open && setRenamingWallet(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Rename Wallet</DialogTitle>
            <DialogDescription className="text-xs">
              Change the display label for {renamingWallet ? shortAddr(renamingWallet.address) : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rename-lbl" className="text-xs font-medium">Wallet Label</Label>
              <Input
                id="rename-lbl"
                value={newLabel}
                placeholder="e.g. Main Vault, Hot Wallet"
                className="text-xs h-9"
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleRename()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setRenamingWallet(null)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleRename()} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Wallet Confirmation Dialog */}
      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base text-destructive">Remove Wallet</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed pt-1">
              Removing deletes the encrypted private key for <span className="font-mono text-foreground font-medium">{removing ? shortAddr(removing) : ''}</span>.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setRemoving(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (removing) {
                  void call('/api/wallets/remove', { address: removing }, 'Wallet removed').then(() =>
                    setRemoving(null),
                  );
                }
              }}
            >
              Delete Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-border/70 bg-card/60 shadow-xs">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
          <div>
            <CardTitle className="text-base font-semibold">Wallets</CardTitle>
            <CardDescription className="text-xs">
              The active wallet signs all transactions. Deposits go to the active address.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void call('/api/wallets/create', {}, 'New wallet created and selected')}
              className="gap-1.5 shadow-xs text-xs h-8"
            >
              <Plus className="size-3.5" />
              <span>New</span>
            </Button>

            <Dialog open={importing} onOpenChange={setImporting}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={busy} className="gap-1.5 shadow-xs text-xs h-8">
                  <KeyRound className="size-3.5" />
                  <span>Import</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base">Import a Wallet</DialogTitle>
                  <DialogDescription className="text-xs leading-relaxed">
                    The key is encrypted before storage and never displayed again. Paste only on a machine you trust.
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
                        placeholder="0x..."
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        className="font-mono text-xs pr-8 h-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                        title={showKey ? 'Hide key' : 'Show key'}
                      >
                        {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lbl" className="text-xs font-medium">Name (Optional)</Label>
                    <Input
                      id="lbl"
                      placeholder="Optional label"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>
                <DialogFooter className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setImporting(false)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || key.trim().length < 64}
                    onClick={async () => {
                      const ok = await call(
                        '/api/wallets/import',
                        { privateKey: key.trim(), label: label.trim() || null },
                        'Wallet imported and selected',
                      );
                      setKey('');
                      setShowKey(false);
                      if (ok) {
                        setLabel('');
                        setImporting(false);
                      }
                    }}
                  >
                    Import & Select
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void call('/api/export', {}, 'Approval request sent to Telegram. The key is delivered there securely.')
              }
              className="gap-1.5 shadow-xs text-xs h-8 text-muted-foreground hover:text-foreground"
              title="Export active wallet private key via Telegram"
            >
              <Download className="size-3.5" />
              <span>Export Key</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-4 space-y-2">
          {wallets.length === 0 && (
            <div className="py-6 text-center select-none">
              <p className="text-sm text-muted-foreground">No wallets registered yet</p>
            </div>
          )}
          {wallets.map((w) => (
            <div
              key={w.address}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors',
                w.isActive
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border/50 hover:bg-muted/30 hover:border-border',
              )}
            >
              <button
                type="button"
                disabled={busy || w.isActive}
                onClick={() =>
                  void call('/api/wallets/switch', { address: w.address }, `Now signing with ${shortAddr(w.address)}`)
                }
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-3 text-left transition-colors cursor-pointer',
                  w.isActive && 'cursor-default',
                )}
              >
                <Wallet2 className={cn('size-4 shrink-0', w.isActive ? 'text-primary' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-xs sm:text-sm text-foreground truncate">
                      {w.label ?? 'Wallet'}
                    </span>
                    {w.imported && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground font-mono">
                        imported
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground font-mono text-[11px] truncate">{w.address}</div>
                </div>
                {w.isActive && <Check className="text-primary size-4 shrink-0" />}
              </button>

              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-md"
                  aria-label={`Rename ${w.label ?? 'wallet'}`}
                  disabled={busy}
                  onClick={() => {
                    setRenamingWallet(w);
                    setNewLabel(w.label ?? '');
                  }}
                  title="Rename wallet"
                >
                  <Pencil className="size-3.5" />
                </Button>

                {wallets.length > 1 && !w.isActive && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer rounded-md"
                    aria-label={`Remove ${w.label ?? 'wallet'}`}
                    disabled={busy}
                    onClick={() => setRemoving(w.address)}
                    title="Remove wallet key"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
};
