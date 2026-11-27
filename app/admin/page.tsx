'use client';

import { Suspense, useEffect, useState } from 'react';
import {
  Activity,
  Ban,
  BadgeDollarSign,
  Coins,
  Layers,
  Receipt,
  Undo2,
  UserPlus,
  Users,
  Wallet2,
} from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';

const BarChart = dynamic(
  () => import('@/components/app/bar-chart').then((m) => m.BarChart),
  { ssr: false },
) as <T>(props: {
  rows: T[];
  valueOf: (row: T) => number;
  tooltip: (row: T) => React.ReactNode;
  height?: number;
  axis?: [string, string];
}) => React.ReactElement | null;

const InviteCard = dynamic(
  () => import('@/components/app/invite-card').then((m) => m.InviteCard),
  { ssr: false },
);
import { StatCard } from '@/components/app/stat-card';
import { TokenAvatar } from '@/components/app/token-avatar';
import { useSession } from '@/components/app/session';
import { AdminSkeleton } from './skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { post } from '@/lib/api';
import { useFetch } from '@/lib/use-live';
import { ago, eth, num, shortAddr, signedUsd, toneClass, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AdminDay, AdminEvent, AdminOverview, AdminUser } from '@/lib/types';

const FEE_ACTIONS = [
  { key: 'open', label: 'Open' },
  { key: 'add', label: 'Add' },
  { key: 'claim', label: 'Claim' },
  { key: 'close', label: 'Close' },
  { key: 'swap', label: 'Swap' },
  { key: 'reposition', label: 'Reposition' },
] as const;
type FeeAction = (typeof FEE_ACTIONS)[number]['key'];
type FeeTable = Record<string, Partial<Record<FeeAction, { usd?: number; pct?: number }>>>;

interface FeeSettings {
  feesEnabled: boolean;
  inviteOnly: boolean;
  referralRewardsLive: boolean;
  feeUsd: number;
  fees: FeeTable;
  /** Only on the GET: every chain the table can hold. */
  chains?: { id: number; badge: string; name: string; explorer: string }[];
  feeWallet: string | null;
  referralShare: number;
  refMinClaimUsd: number;
  updatedAt: number;
  updatedBy: number | null;
}

const SORTS = [
  { key: 'volume', label: 'Top volume' },
  { key: 'pnl', label: 'Top PnL' },
  { key: 'fees', label: 'Top fees' },
  { key: 'positions', label: 'Most positions' },
  { key: 'referrals', label: 'Most referrals' },
  { key: 'recent', label: 'Recently active' },
  { key: 'new', label: 'Newest' },
] as const;

/** Wraps the shared invite panel with the one setting it toggles. */
const InviteGate = () => {
  const { data, reload } = useFetch<FeeSettings>('/api/admin/settings');
  const [busy, setBusy] = useState(false);

  const toggle = async (v: boolean): Promise<void> => {
    setBusy(true);
    try {
      await post('/api/admin/settings', { inviteOnly: v });
      toast.success(v ? 'Registration is invite only' : 'Registration is open');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'that did not work');
    } finally {
      setBusy(false);
    }
  };

  return <InviteCard inviteOnly={data?.inviteOnly ?? false} onToggle={(v) => void toggle(v)} busy={busy} />;
};

const FeeCard = () => {
  const { data, error, reload } = useFetch<FeeSettings>('/api/admin/settings');
  const [draft, setDraft] = useState<FeeSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (error) return null;
  if (!draft) return <Skeleton className="h-72" />;

  const save = async (patch: Partial<FeeSettings>): Promise<void> => {
    setBusy(true);
    setDraft({ ...draft, ...patch });
    try {
      const next = await post<FeeSettings>('/api/admin/settings', patch);
      setDraft(next);
      toast.success('Fee settings saved');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'could not save');
      if (data) setDraft(data);
    } finally {
      setBusy(false);
    }
  };

  const noWallet = !draft.feeWallet;
  const chains = data?.chains ?? [];
  const cell = (chain: number, action: FeeAction, field: 'usd' | 'pct'): string => {
    const v = draft.fees?.[String(chain)]?.[action]?.[field];
    return v === undefined ? '' : String(v);
  };
  const setCell = (chain: number, action: FeeAction, field: 'usd' | 'pct', text: string): void => {
    const fees = JSON.parse(JSON.stringify(draft.fees ?? {})) as FeeTable;
    const entry = { ...(fees[String(chain)]?.[action] ?? {}) };
    if (text.trim() === '') delete entry[field];
    else entry[field] = Number(text);
    fees[String(chain)] = { ...(fees[String(chain)] ?? {}), [action]: entry };
    setDraft({ ...draft, fees });
  };
  const saveTable = (): void => {
    if (JSON.stringify(draft.fees ?? {}) !== JSON.stringify(data?.fees ?? {})) void save({ fees: draft.fees });
  };

  return (
    <Card className="border-border/70 bg-card/60 shadow-xs">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="text-base font-semibold">Fee Configuration</CardTitle>
        <CardDescription className="text-xs">
          Charged after the action confirms, so a reverted one is always free. Priced per chain and per action.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-48 flex-1">
            <div className="text-sm font-medium">Charge a fee</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              Off means every position is free for everyone.
            </div>
          </div>
          <Switch
            checked={draft.feesEnabled}
            disabled={busy}
            onCheckedChange={(v) => void save({ feesEnabled: v })}
          />
        </div>

        {draft.feesEnabled && noWallet && (
          <p className="text-destructive text-sm">
            No destination address, so nothing is being charged. Set one below.
          </p>
        )}

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-48 flex-1">
            <div className="text-sm font-medium">Referral rewards are live</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              Off means users see the invite link and nothing else. Credits still accrue in the ledger, so
              turning this on later pays out everything earned since day one.
            </div>
          </div>
          <Switch
            checked={draft.referralRewardsLive}
            disabled={busy}
            onCheckedChange={(v) => void save({ referralRewardsLive: v })}
          />
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="feeUsd">Default open fee (USD)</Label>
            <Input
              id="feeUsd"
              type="number"
              step="0.01"
              min="0"
              className="tabular"
              value={draft.feeUsd}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, feeUsd: Number(e.target.value) })}
              onBlur={(e) => void save({ feeUsd: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="feeWallet">Fees go to</Label>
            <Input
              id="feeWallet"
              spellCheck={false}
              placeholder="0x…"
              className="font-mono text-xs"
              value={draft.feeWallet ?? ''}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, feeWallet: e.target.value })}
              onBlur={(e) => void save({ feeWallet: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="share">Referral share</Label>
            <Input
              id="share"
              type="number"
              step="0.0001"
              min="0"
              max="1"
              className="tabular"
              value={draft.referralShare}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, referralShare: Number(e.target.value) })}
              onBlur={(e) => void save({ referralShare: Number(e.target.value) })}
            />
            <p className="text-muted-foreground text-xs">
              {(draft.referralShare * 100).toFixed(2)}% of each fee, or {usd(draft.feeUsd * draft.referralShare)}{' '}
              per position.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="minClaim">Minimum claim (USD)</Label>
            <Input
              id="minClaim"
              type="number"
              step="1"
              min="0"
              className="tabular"
              value={draft.refMinClaimUsd}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, refMinClaimUsd: Number(e.target.value) })}
              onBlur={(e) => void save({ refMinClaimUsd: Number(e.target.value) })}
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div>
            <div className="text-sm font-medium">Per chain and action</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              USD is flat; % is of what the action moved: the deposit, the fees claimed, the value closed, the
              swap. Blank follows the default: the open fee above for opens, nothing otherwise. A claim, close or
              swap never pays more than 20% of what it moved. Under half a cent is skipped. An account&apos;s own
              price still wins for opens.
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  {chains.flatMap((c) => [
                    <TableHead key={`${c.id}-usd`}>{c.badge} USD</TableHead>,
                    <TableHead key={`${c.id}-pct`}>{c.badge} %</TableHead>,
                  ])}
                </TableRow>
              </TableHeader>
              <TableBody>
                {FEE_ACTIONS.map((a) => (
                  <TableRow key={a.key}>
                    <TableCell className="font-medium">{a.label}</TableCell>
                    {chains.flatMap((c) =>
                      (['usd', 'pct'] as const).map((field) => (
                        <TableCell key={`${c.id}-${field}`} className="px-1">
                          <Input
                            id={`fee-${c.id}-${a.key}-${field}`}
                            aria-label={`${c.name} ${a.label} ${field === 'usd' ? 'USD' : 'percent'}`}
                            type="number"
                            step={field === 'usd' ? '0.01' : '0.1'}
                            min="0"
                            className="tabular placeholder:text-muted-foreground/50 h-8 w-24 placeholder:italic"
                            placeholder={`default ${field === 'usd' && a.key === 'open' ? draft.feeUsd : 0}`}
                            value={cell(c.id, a.key, field)}
                            disabled={busy}
                            onChange={(e) => setCell(c.id, a.key, field, e.target.value)}
                            onBlur={saveTable}
                          />
                        </TableCell>
                      )),
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          Payouts are signed with <code className="font-mono">FEE_PRIVATE_KEY</code> from the environment,
          which is deliberately not editable here. Changing the address above only redirects where new fees
          land.
        </p>
      </CardContent>
    </Card>
  );
};

/**
 * One account's price. Blank means it follows the platform number, which is why
 * an empty box clears the override rather than setting the fee to zero - zero is
 * a real price you can type, and it means free.
 */
const FeeCell = ({
  user,
  platformFee,
  onSave,
}: {
  user: AdminUser;
  platformFee: number;
  onSave: (patch: { exempt?: boolean; feeUsd?: number | null }, ok: string) => void;
}) => {
  const [text, setText] = useState(user.feeUsdOverride === null ? '' : String(user.feeUsdOverride));

  const commit = (): void => {
    const trimmed = text.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if (next !== null && !Number.isFinite(next)) return setText('');
    if (next === user.feeUsdOverride) return;
    onSave(
      { feeUsd: next },
      next === null ? `#${user.userId} follows the platform fee` : `#${user.userId} pays ${usd(next)}`,
    );
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        value={text}
        inputMode="decimal"
        disabled={user.feeExempt}
        placeholder={platformFee.toFixed(2)}
        aria-label={`Fee for user ${user.userId}`}
        className="tabular h-8 w-20 text-right"
        onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <Switch
        checked={user.feeExempt}
        aria-label="Fee exempt"
        onCheckedChange={(v) =>
          onSave(
            { exempt: v },
            v ? `#${user.userId} trades fee-free` : `#${user.userId} pays fees again`,
          )
        }
      />
    </div>
  );
};

const ConfirmButton = ({ label, disabled, onConfirm }: { label: string; disabled?: boolean; onConfirm: () => void }) => {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      variant={armed ? 'destructive' : 'outline'}
      size="sm"
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? 'Tap again to confirm' : label}
    </Button>
  );
};

const Page = () => {
  const { me } = useSession();
  const [sort, setSort] = useState<string>('volume');
  const [metric, setMetric] = useState<'volumeUsd' | 'pnlUsd' | 'feesGeneratedUsd' | 'feesUsd'>('volumeUsd');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [acting, setActing] = useState(false);
  const PAGE = 20;
  useEffect(() => { const timer = setTimeout(() => { setQ(search.trim()); setPage(0); }, 300); return () => clearTimeout(timer); }, [search]);
  const { data: overview, error, reload: reloadOverview } = useFetch<AdminOverview>(me?.isAdmin ? '/api/admin/overview' : null);
  const { data: users, error: usersError, loading: usersLoading, reload: reloadUsers } = useFetch<{ rows: AdminUser[]; total: number }>(
    me?.isAdmin ? `/api/admin/users?sort=${sort}&limit=${PAGE}&offset=${page * PAGE}&q=${encodeURIComponent(q)}` : null,
  );
  const { data: feed } = useFetch<{ rows: AdminEvent[] }>(me?.isAdmin ? '/api/admin/activity?limit=40' : null);
  // Only for the placeholder in the fee column: it shows what an account pays
  // while it has no price of its own.
  const { data: platform } = useFetch<FeeSettings>(me?.isAdmin ? '/api/admin/settings' : null);

  if (!me?.isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center select-none py-16">
        <p className="text-sm text-muted-foreground">Unauthorized account (403)</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center select-none py-16">
        <p className="text-sm text-muted-foreground">Failed to load admin overview ({error})</p>
      </div>
    );
  }

  if (!overview) {
    return <AdminSkeleton />;
  }

  const s = overview.stats;
  const total = users?.total ?? 0;
  const rows = users?.rows ?? [];
  const pageSuspendable = rows.filter((u) => u.status === 'active' && !u.isAdmin && u.userId !== me?.userId).map((u) => u.userId);
  const pageRestorable = rows.filter((u) => u.status !== 'active').map((u) => u.userId);

  const act = async (path: string, body: unknown, ok: string): Promise<void> => {
    if (acting) return;
    setActing(true);
    try {
      await post(path, body);
      toast.success(ok);
      reloadUsers();
      reloadOverview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'that did not work');
    } finally { setActing(false); }
  };

  return (
    <div className="flex flex-col gap-5 w-full flex-1">
      <div className="grid gap-3 sm:gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Users"
          value={num(s.users)}
          sub={`${s.new24h} new today · ${s.new7d} this week`}
        />
        <StatCard
          icon={Activity}
          label="Active today"
          value={num(s.active24h)}
          sub={`${s.active7d} / 7d · ${s.active30d} / 30d`}
        />
        <StatCard icon={Coins} label="Volume" value={usd(s.volumeUsd)} sub={eth(s.volumeEth)} />
        <StatCard
          icon={Receipt}
          label="Fees collected"
          value={usd(s.feesUsd)}
          sub={s.feesMissed > 0 ? `${num(s.feesMissed)} missed, ${usd(s.feesMissedUsd)}` : undefined}
        />
        <StatCard
          icon={Layers}
          label="Positions"
          value={num(s.positionsOpened)}
          sub={`${s.positionsLive} live · ${s.positionsClosed} closed`}
        />
        <StatCard
          icon={BadgeDollarSign}
          label="Total deposited"
          value={usd(s.depositedUsd)}
          sub="cost basis of every position"
        />
        <StatCard icon={Activity} label="Transactions" value={num(s.txCount)} />
        <StatCard
          icon={Wallet2}
          label="Wallets"
          value={num(s.usersWithWallet)}
          sub={`${s.usersWithPosition} have traded · ${s.banned} suspended`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FeeCard />
        <InviteGate />
      </div>

      <Card className="border-border/70 bg-card/60 shadow-xs">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="text-base font-semibold">Daily Performance</CardTitle>
          <CardDescription className="text-xs">Last 30 days. Fees generated are LP earnings; platform fees are charges paid to the bot.</CardDescription>
          <div className="flex flex-wrap gap-1.5">{([{ key: 'volumeUsd', label: 'Volume' }, { key: 'pnlUsd', label: 'PnL' }, { key: 'feesGeneratedUsd', label: 'Fees generated' }, { key: 'feesUsd', label: 'Platform fees' }] as const).map((item) => <Button key={item.key} size="sm" variant={metric === item.key ? 'secondary' : 'ghost'} onClick={() => setMetric(item.key)}>{item.label}</Button>)}</div>
        </CardHeader>
        <CardContent className="pt-4">
          <BarChart<AdminDay>
            rows={[...overview.daily].reverse()}
            valueOf={(d) => d[metric]}
            axis={[
              overview.daily[overview.daily.length - 1]?.day ?? '',
              overview.daily[0]?.day ?? '',
            ]}
            tooltip={(d) => (
              <div className="tabular space-y-0.5">
                <div className="font-semibold">{d.day}</div>
                <div>{usd(d.volumeUsd)} volume</div>
                <div className={toneClass(d.pnlUsd)}>{signedUsd(d.pnlUsd)} PnL</div>
                <div>{usd(d.feesGeneratedUsd)} LP fees · {usd(d.feesUsd)} platform fees</div>
                <div className="text-muted-foreground">
                  {d.opens} opens · {d.closes} closes
                </div>
                <div className="text-muted-foreground">
                  {d.signups} signups · {d.activeUsers} active
                </div>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/60 shadow-xs">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-border/40">
          <div>
            <CardTitle className="text-base font-semibold">{num(s.users)} Users</CardTitle>
            <CardDescription className="text-xs">Suspend an account, or let one trade without a fee.</CardDescription>
          </div>
          <div className="flex w-full flex-wrap gap-2 items-center">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search id, @username or wallet" aria-label="Search users" className="h-8 max-w-xs" />
            <ConfirmButton label={`Suspend page (${pageSuspendable.length})`} disabled={acting || !pageSuspendable.length} onConfirm={() => void act('/api/admin/users/status', { userIds: pageSuspendable, status: 'banned' }, 'Page suspended')} />
            <ConfirmButton label={`Restore page (${pageRestorable.length})`} disabled={acting || !pageRestorable.length} onConfirm={() => void act('/api/admin/users/status', { userIds: pageRestorable, status: 'active' }, 'Page restored')} />
            <ConfirmButton label="Restore all suspended" disabled={acting || !s.banned} onConfirm={() => void act('/api/admin/users/restore-all', {}, 'Suspended accounts restored')} />
            <ConfirmButton label="Revoke all fee-free" disabled={acting} onConfirm={() => void act('/api/admin/users/revoke-free', {}, 'Fee exemptions revoked')} />
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1">
            {SORTS.map((o) => (
              <Button
                key={o.key}
                variant={sort === o.key ? 'secondary' : 'ghost'}
                size="xs"
                className={cn(
                  'h-7 px-2.5 text-xs font-medium transition-all',
                  sort === o.key && 'bg-background text-foreground shadow-2xs font-semibold',
                )}
                onClick={() => { setSort(o.key); setPage(0); }}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">PnL</TableHead>
                  <TableHead className="text-right">Positions</TableHead>
                  <TableHead className="text-right">LP fees earned</TableHead>
                  <TableHead className="text-right">Fees paid</TableHead>
                  <TableHead className="text-right">Refs</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead className="text-right">Fee / free</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersError && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={11} className="py-16 text-center select-none">
                      <p className="text-sm text-muted-foreground">Failed to load users ({usersError})</p>
                    </TableCell>
                  </TableRow>
                )}
                {usersLoading && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={11} className="py-16 text-center select-none">
                      <p className="text-sm text-muted-foreground">Loading users…</p>
                    </TableCell>
                  </TableRow>
                )}
                {!usersError && !usersLoading && !users?.rows.length && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={11} className="py-16 text-center select-none">
                      <p className="text-sm text-muted-foreground">No users match this search</p>
                    </TableCell>
                  </TableRow>
                )}
                {(users?.rows ?? []).map((u) => (
                  <TableRow key={u.userId}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {u.username ? `@${u.username}` : `#${u.userId}`}
                      {u.isAdmin && (
                        <Badge variant="secondary" className="ml-2">
                          admin
                        </Badge>
                      )}
                      {u.status !== 'active' && (
                        <Badge variant="destructive" className="ml-2">
                          {u.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {shortAddr(u.address)}
                    </TableCell>
                    <TableCell className="tabular text-right">{usd(u.volumeUsd)}</TableCell>
                    <TableCell className={cn('tabular text-right', toneClass(u.realizedPnlUsd))}>
                      {signedUsd(u.realizedPnlUsd)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {u.positionsOpened}
                      {u.positionsLive > 0 && (
                        <span className="text-muted-foreground"> ({u.positionsLive})</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right">{usd(u.feesGeneratedUsd)}</TableCell>
                    <TableCell className="tabular text-right">{usd(u.feesPaidUsd)}</TableCell>
                    <TableCell className="tabular text-right">{u.referrals}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {ago(u.lastActionAt)}
                    </TableCell>
                    <TableCell>
                      <FeeCell
                        user={u}
                        platformFee={platform?.feeUsd ?? 0}
                        onSave={(patch, ok) => void act('/api/admin/user-fee', { userId: u.userId, ...patch }, ok)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={acting || (u.status === 'active' && (u.isAdmin || u.userId === me?.userId))}
                        onClick={() =>
                          void act(
                            '/api/admin/user-status',
                            { userId: u.userId, status: u.status === 'active' ? 'banned' : 'active' },
                            u.status === 'active' ? `#${u.userId} suspended` : `#${u.userId} restored`,
                          )
                        }
                      >
                        {u.status === 'active' ? (
                          <>
                            <Ban className="size-3.5" />
                            Suspend
                          </>
                        ) : (
                          <>
                            <Undo2 className="size-3.5" />
                            Restore
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end gap-3 px-4 pt-3 text-xs"><span>{total} users · Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE))}</span><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/70 bg-card/60 shadow-xs">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-base font-semibold">Top Tokens</CardTitle>
            <CardDescription className="text-xs">Most actively deposited assets.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="text-xs font-semibold">Token</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Positions</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Deposited</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.tokens.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={3} className="py-16 text-center select-none">
                      <p className="text-sm text-muted-foreground">No deposited tokens yet</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  overview.tokens.map((t) => (
                    <TableRow key={t.address} className="border-border/30 hover:bg-muted/30">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <TokenAvatar symbol={t.symbol} address={t.address} size="xs" />
                          <span className="font-semibold text-xs sm:text-sm">{t.symbol}</span>
                        </div>
                      </TableCell>
                      <TableCell className="tabular text-right text-xs font-medium">
                        {t.positions}
                        {t.live > 0 && <span className="text-muted-foreground font-mono"> ({t.live})</span>}
                      </TableCell>
                      <TableCell className="tabular text-right text-xs font-semibold">{usd(t.depositedUsd)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60 shadow-xs">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-base font-semibold">Activity Stream</CardTitle>
            <CardDescription className="text-xs">Real-time ledger events.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-105 overflow-y-auto px-0">
            <Table>
              <TableBody>
                {!feed?.rows?.length ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="py-16 text-center select-none">
                      <p className="text-sm text-muted-foreground">No recent activity</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  feed.rows.map((e) => (
                    <TableRow key={e.id} className="border-border/30 hover:bg-muted/30 text-xs">
                      <TableCell className="text-muted-foreground whitespace-nowrap font-mono">{ago(e.at)}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {e.username ? `@${e.username}` : `#${e.userId}`}
                      </TableCell>
                      <TableCell className="whitespace-nowrap capitalize text-muted-foreground">{e.kind.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {e.usd === null ? '' : usd(e.usd)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <UserPlus className="size-3.5" />
        {platform?.inviteOnly ? 'Registration is invite only.' : 'Registration is open.'}
      </p>
    </div>
  );
};

const AdminPage = () => (
  <Suspense fallback={<AdminSkeleton />}>
    <Page />
  </Suspense>
);

export default AdminPage;
