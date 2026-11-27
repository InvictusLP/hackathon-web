'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, Compass, Gauge, Settings2, Sliders, Network } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ChainAvatar } from '@/components/app/chain-avatar';
import { useSession } from '@/components/app/session';
import { SettingsSkeleton } from './skeleton';
import { Switch } from '@/components/ui/switch';
import { post } from '@/lib/api';
import { BLOCK_EXPLORERS, type BlockExplorerId, useBlockExplorer } from '@/lib/explorer';
import { useFetch } from '@/lib/use-live';
import { fetchStore } from '@/lib/fetch-store';
import { useGasReading } from '@/components/app/live';
import { usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { RpcOverview, RpcProbe, SettingsPayload } from '@/lib/types';

const SPEEDS = [
  { name: 'Normal', pct: 100, desc: 'Standard priority' },
  { name: 'Fast', pct: 150, desc: 'Front-run blocks' },
  { name: 'Turbo', pct: 300, desc: 'Urgent execution' },
];

const ADVANCED = ['gasLimitPct', 'maxFeeGweiCap', 'priorityFeePct'];
const HIDDEN = ['maxGasUsd'];

type RpcResult = { ok: boolean; message: string; ms?: number };

const RpcRow = ({ row, onChange }: { row: RpcOverview; onChange: () => void }) => {
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState<'test' | 'save' | 'reset' | null>(null);
  const [result, setResult] = useState<RpcResult | null>(null);
  const running = useRef(false);
  const id = `rpc-url-${row.chainId}`;
  const value = url.trim();

  const run = async (action: 'test' | 'save' | 'reset'): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setPending(action);
    setResult(null);
    try {
      if (action === 'reset') {
        await post('/api/rpc', { chainId: row.chainId, url: null });
        setUrl('');
        setResult({ ok: true, message: 'Using default endpoints' });
        onChange();
        return;
      }
      const probe = await post<RpcProbe>(action === 'save' ? '/api/rpc' : '/api/rpc/probe', {
        chainId: row.chainId,
        ...(value ? { url: value } : {}),
      });
      if (action === 'save') {
        setUrl('');
        onChange();
      }
      setResult({ ok: true, message: action === 'save' ? 'Custom endpoint saved' : 'Endpoint responding', ms: probe.ms });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Check failed' });
    } finally {
      running.current = false;
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ChainAvatar chainId={row.chainId} size={16} />
          {row.name}
        </Label>
        <Badge variant="outline" className="text-xs">{row.customUrl ? 'Custom' : 'Default'}</Badge>
      </div>
      <div className="font-mono text-[11px] text-muted-foreground break-all">
        {row.customUrl ?? `${row.defaultCount} configured endpoint${row.defaultCount === 1 ? '' : 's'}`}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          type="url"
          inputMode="url"
          maxLength={512}
          autoComplete="off"
          spellCheck={false}
          placeholder={row.customUrl ? 'New URL to replace it' : 'https://...'}
          className="flex-1 h-9 text-xs border-border/60 bg-muted/30 font-mono"
          value={url}
          disabled={!!pending}
          aria-invalid={result?.ok === false}
          onChange={(e) => {
            setUrl(e.target.value);
            setResult(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (value || row.customUrl)) void run('test');
          }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!!pending || (!value && !row.customUrl)}
          onClick={() => void run('test')}
          className="h-9 cursor-pointer"
        >
          {pending === 'test' ? 'Testing...' : 'Test'}
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={!!pending || !value}
          onClick={() => void run('save')}
          className="h-9 cursor-pointer"
        >
          {pending === 'save' ? 'Saving...' : 'Save'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!!pending || !row.customUrl}
          onClick={() => void run('reset')}
          className="h-9 cursor-pointer"
        >
          Reset
        </Button>
      </div>
      {result && (
        <div
          role={result.ok ? 'status' : 'alert'}
          className={cn(
            'flex items-center gap-2 rounded-lg border p-3 text-xs',
            result.ok
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-500'
              : 'border-destructive/30 bg-destructive/5 text-destructive',
          )}
        >
          {result.ok ? <Network className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
          <span className="flex-1">{result.message}</span>
          {result.ms !== undefined && <span className="font-mono">{result.ms}ms</span>}
        </div>
      )}
    </div>
  );
};

const RpcSection = () => {
  const { data, error, reload } = useFetch<RpcOverview[]>('/api/rpc');
  return (
    <Card className="border-border/70 bg-card/60 shadow-xs">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="text-sm sm:text-[15px] font-semibold flex items-center gap-2">
          <Network className="size-4 text-primary" />
          <span>Custom RPC endpoint</span>
        </CardTitle>
        <CardDescription className="text-xs">
          Broadcast only. Reads and transaction preparation stay on the default endpoints. A failed custom broadcast does not fall back.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {data ? (
          <div className="divide-y divide-border/40">
            {data.map((row) => <RpcRow key={row.chainId} row={row} onChange={reload} />)}
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Failed to load endpoints ({error})</span>
            <Button variant="outline" size="sm" onClick={reload} className="h-7 text-xs cursor-pointer">Retry</Button>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Loading endpoints...</div>
        )}
      </CardContent>
    </Card>
  );
};

const Page = () => {
  const { data, error, reload } = useFetch<SettingsPayload>('/api/settings');
  const gas = useGasReading();
  const [draft, setDraft] = useState<Record<string, number | boolean | string | null>>({});
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const previous = useRef<SettingsPayload['values']>({});
  const { explorerId, setExplorerId, options: explorerOptions, explorer } = useBlockExplorer();
  const { me } = useSession();
  useEffect(() => {
    if (!data) return;
    const old = previous.current;
    setDraft((current) => Object.fromEntries(Object.entries(data.values).map(([key, value]) => [
      key, current[key] === undefined || current[key] === old[key] ? value : current[key],
    ])));
    previous.current = data.values;
  }, [data]);

  useEffect(() => {
    const refresh = () => reload();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [reload]);

  if (!data) {
    if (error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center select-none py-16 space-y-2">
          <p className="text-sm text-muted-foreground">Failed to load settings ({error})</p>
          <Button variant="outline" size="sm" onClick={reload} className="h-7 text-xs cursor-pointer">
            Retry
          </Button>
        </div>
      );
    }
    return <SettingsSkeleton />;
  }

  const save = async (patch: Record<string, number | boolean | string | null>): Promise<void> => {
    if (saving.current || Object.entries(patch).every(([key, value]) => data.values[key] === value)) return;
    saving.current = true;
    setBusy(true);
    setDraft((current) => ({ ...current, ...patch }));
    try {
      const values = await post<SettingsPayload['values']>('/api/settings', patch);
      fetchStore.set('/api/settings', { ...data, values });
      fetchStore.invalidate((path) => path === '/api/gas', false);
      toast.success('Settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save settings');
      setDraft((current) => ({ ...current, ...Object.fromEntries(Object.keys(patch).map((key) => [key, data.values[key] ?? null])) }));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const speed = Number(draft.priorityFeePct ?? 150);
  const capUsd = Number(draft.maxGasUsd ?? 1);
  // Base fees do not scale with the priority multiplier; other presets need a new quote.
  const costAt = (pct: number): string => gas && !busy && pct === Number(data.values.priorityFeePct) ? usd(gas.openUsd) : '—';

  const rows = Object.entries(data.meta).filter(
    ([key]) => !ADVANCED.includes(key) && !HIDDEN.includes(key),
  );

  const row = (id: string) => {
    const meta = data.meta[id];
    if (!meta) return null;
    const isBool = meta.kind === 'bool';
    return (
      <div
        key={id}
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 py-3.5 transition-colors',
          isBool && 'cursor-pointer select-none',
        )}
        onClick={() => {
          if (isBool && !busy) {
            void save({ [id]: !draft[id] });
          }
        }}
      >
        <div className="min-w-48 flex-1">
          <div className="text-sm font-medium text-foreground">{meta.label}</div>
          <div className="text-muted-foreground mt-0.5 text-xs">{meta.hint}</div>
        </div>
        {isBool ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={Boolean(draft[id])}
              disabled={busy}
              onCheckedChange={(v) => void save({ [id]: v })}
            />
          </div>
        ) : meta.options ? (
          <div className="flex flex-wrap gap-1.5">
            {meta.options.map((label, i) => <Button key={label} size="sm" variant={Number(draft[id]) === i ? 'default' : 'outline'} disabled={busy} onClick={() => void save({ [id]: i })}>{label}</Button>)}
          </div>
        ) : (
          <Input
            type="number"
            className="tabular w-32 h-9 text-xs border-border/60 bg-muted/30"
            step={meta.kind === 'int' ? 1 : 0.01}
            min={meta.min}
            max={meta.max}
            value={Number(draft[id] ?? 0)}
            disabled={busy}
            onChange={(e) => setDraft({ ...draft, [id]: Number(e.target.value) })}
            onBlur={(e) => void save({ [id]: Number(e.target.value) })}
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5 w-full flex-1">
        {/* Gas Speed & Limit Card */}
        <Card className="border-border/70 bg-card/60 shadow-xs">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm sm:text-[15px] font-semibold flex items-center gap-2">
                  <Gauge className="size-4 text-primary" />
                  <span>Execution Speed & Gas Strategy</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  How aggressive the bot bids priority fees to confirm transactions on Robinhood Chain.
                </CardDescription>
              </div>
              {gas && (
                <Badge variant="outline" className="text-xs tabular font-mono">
                  Base: {gas.baseGwei.toFixed(2)} gwei
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SPEEDS.map((s) => {
                const isActive = speed === s.pct;
                return (
                  <button
                    key={s.pct}
                    type="button"
                    disabled={busy}
                    onClick={() => void save({ priorityFeePct: s.pct })}
                    className={cn(
                      'flex flex-col text-left rounded-lg border p-3 transition-colors cursor-pointer',
                      isActive
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/50 bg-card/40 hover:bg-muted/30 hover:border-border',
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm font-medium text-foreground">{s.name}</span>
                      <span className="tabular text-xs font-semibold text-primary">{costAt(s.pct)}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-1">{s.desc}</span>
                  </button>
                );
              })}
            </div>

            <Separator className="border-border/40" />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-48 flex-1">
                <Label htmlFor="cap" className="text-sm font-medium text-foreground">
                  Transaction Cost Ceiling (USD)
                </Label>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Transactions exceeding this dollar estimate will be automatically aborted before broadcasting.
                </p>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <Input
                  id="cap"
                  type="number"
                  className="tabular w-32 pl-6 h-9 text-xs border-border/60 bg-muted/30 font-medium"
                  step="0.01"
                  min="0.01"
                  value={capUsd}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, maxGasUsd: Number(e.target.value) })}
                  onBlur={(e) => void save({ maxGasUsd: Number(e.target.value) })}
                />
              </div>
            </div>

            {gas && gas.openUsd > capUsd && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-500">
                <AlertCircle className="size-4 shrink-0" />
                <span>
                  Current open fee ({usd(gas.openUsd)}) exceeds your ${capUsd} ceiling. Positions will not open until gas subsides or ceiling is raised.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trading Preferences */}
        <Card className="border-border/70 bg-card/60 shadow-xs">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm sm:text-[15px] font-semibold flex items-center gap-2">
              <Settings2 className="size-4 text-primary" />
              <span>Trading & Risk Knobs</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Slippage boundaries and automated safety preferences.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="divide-y divide-border/30">
              {rows.map(([key]) => row(key))}
            </div>

            {/* Advanced Gas Controls */}
            <Collapsible className="mt-4 border-t border-border/30 pt-4">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="group -ml-2 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer">
                  <Sliders className="mr-1.5 size-3.5" />
                  <span>Advanced Gas Parameters</span>
                  <ChevronDown className="ml-1 size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="divide-y divide-border/30">
                  {ADVANCED.map((key) => row(key))}
                </div>
                {gas && (
                  <p className="text-muted-foreground tabular mt-3 text-[11px] font-mono">
                    Base: {gas.baseGwei.toFixed(4)} gwei · Tip: {gas.tipGwei.toFixed(4)} gwei · Max: {gas.maxGwei.toFixed(4)} gwei
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {/* Block Explorer Preferences */}
        <Card className="border-border/70 bg-card/60 shadow-xs">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm sm:text-[15px] font-semibold flex items-center gap-2">
              <Compass className="size-4 text-primary" />
              <span>Block Explorer</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Select which Robinhood Chain explorer to open when inspecting wallets, contracts, pools, and transactions.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-48 flex-1">
                <div className="text-sm font-medium text-foreground">Preferred Explorer</div>
                <div className="text-muted-foreground mt-0.5 text-xs">
                  Active: <span className="font-mono text-foreground font-medium">{explorer.name}</span> ({explorer.domain})
                </div>
              </div>
              <Select
                value={explorerId}
                onValueChange={(val) => {
                  const next = val as BlockExplorerId;
                  setExplorerId(next);
                  toast.success(`Explorer set to ${BLOCK_EXPLORERS[next]?.name || next}`);
                }}
              >
                <SelectTrigger className="w-52 h-9 text-xs bg-muted/30 border-border/60">
                  <SelectValue placeholder="Select Explorer" />
                </SelectTrigger>
                <SelectContent align="end" className="w-64">
                  {explorerOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id} className="text-xs py-1.5">
                      <div className="flex flex-col gap-0.5 text-left">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <span>{opt.name}</span>
                          {opt.isDefault && (
                            <span className="text-[10px] text-primary/80 font-normal">(Default)</span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">{opt.domain}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-medium text-foreground text-[11px] uppercase tracking-wider">Explorer Capabilities:</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                {explorerOptions.map((opt) => (
                  <div
                    key={opt.id}
                    onClick={() => {
                      setExplorerId(opt.id);
                      toast.success(`Explorer set to ${opt.name}`);
                    }}
                    className={cn(
                      'rounded-md border p-2.5 transition-all cursor-pointer flex flex-col justify-between',
                      explorerId === opt.id
                        ? 'border-primary/50 bg-primary/5 text-foreground shadow-2xs'
                        : 'border-border/40 bg-card/30 hover:border-border hover:bg-muted/40 text-muted-foreground',
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground text-xs">{opt.name}</span>
                        {opt.isDefault && (
                          <span className="text-[9px] uppercase px-1 rounded bg-primary/10 text-primary font-medium">1st Pick</span>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{opt.domain}</div>
                    </div>
                    <div className="mt-2 text-[10px] leading-relaxed">
                      {opt.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {me?.customRpcEnabled && <RpcSection />}
      </div>
  );
};

const SettingsPage = () => (
  <Suspense fallback={<SettingsSkeleton />}>
    <Page />
  </Suspense>
);

export default SettingsPage;
