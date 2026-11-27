'use client';

import { useState } from 'react';
import { Check, Copy, Gift, Handshake, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ReferralSkeleton } from './skeleton';
import { newIdempotencyKey, post } from '@/lib/api';
import { useFetch } from '@/lib/use-live';
import { usd } from '@/lib/format';
import type { PublicReferral } from '@/lib/types';

const Page = () => {
  const { data, error, reload } = useFetch<PublicReferral>('/api/referral');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!data) {
    if (error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center select-none py-16 space-y-2">
          <p className="text-sm text-muted-foreground">Failed to load referral data ({error})</p>
          <Button variant="outline" size="sm" onClick={reload} className="h-7 text-xs cursor-pointer">
            Retry
          </Button>
        </div>
      );
    }
    return <ReferralSkeleton />;
  }

  const copyLink = () => {
    void navigator.clipboard.writeText(data.link);
    setCopied(true);
    toast.success('Referral link copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const rename = async (): Promise<void> => {
    setBusy(true);
    try {
      await post('/api/referral/code', { code: code.trim() });
      toast.success('Invite code updated');
      setCode('');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not set that code');
    } finally {
      setBusy(false);
    }
  };

  const claim = async (): Promise<void> => {
    setBusy(true);
    try {
      const out = await post<{ usd: number }>('/api/referral/claim', {}, newIdempotencyKey());
      toast.success(`${usd(out.usd)} sent to your wallet`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Claim failed');
    } finally {
      setBusy(false);
    }
  };

  const canClaim = Boolean(
    data.rewardsLive &&
      (data.claimableUsd ?? 0) >= (data.minClaimUsd ?? 0) &&
      (data.claimableUsd ?? 0) > 0,
  );

  return (
    <div className="flex flex-col gap-5 flex-1 w-full min-h-[calc(100svh-8rem)]">
        {/* Invite Link & Code Configuration Card */}
        <Card className="border-border/70 bg-card/60 shadow-xs shrink-0">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm sm:text-[15px] font-semibold flex items-center gap-2">
              <Handshake className="size-4 text-primary" />
              <span>Your Referral Link</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Anyone launching the Telegram bot through this link is permanently tied to your referral account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {/* Link & Copy Action */}
            <div className="flex flex-wrap items-center gap-2">
              <code className="bg-muted/50 flex-1 rounded-lg px-3.5 py-2.5 font-mono text-xs sm:text-sm break-all select-all border border-border/50 text-foreground font-medium">
                {data.link}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-10 px-3.5 shadow-xs cursor-pointer"
                onClick={copyLink}
              >
                {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Link'}</span>
              </Button>
            </div>

            {/* Custom Code Editor */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground font-medium">Custom Code:</span>
              <Input
                value={code}
                placeholder={data.code}
                spellCheck={false}
                className="min-w-40 max-w-xs h-9 text-xs border-border/60 bg-muted/30 font-mono"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && code.trim().length >= 3) {
                    void rename();
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={busy || code.trim().length < 3 || code.trim() === data.code}
                onClick={() => void rename()}
                className="h-9 text-xs shadow-xs cursor-pointer"
              >
                Save Code
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Unified Referral Overview Card */}
        <Card className="border-border/70 bg-card/60 shadow-xs flex-1 flex flex-col justify-between min-h-[240px] sm:min-h-[270px]">
          <CardHeader className="pb-3 border-b border-border/40 shrink-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <span>Referral Overview</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Live statistics of traders bound to your account and fee commission rewards.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col justify-between">
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30 flex-1">
              {/* Left Cell: Traders Metrics */}
              <div className="p-5 sm:p-6 flex flex-col justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Referred Traders</div>
                  <div className="space-y-1 mt-1">
                    <div className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground tabular-nums">
                      {data.totalReferred}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground font-medium">{data.activeReferred}</strong> active traders have opened a position.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Cell: Commission & Rewards */}
              <div className="p-5 sm:p-6 space-y-4 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Commission Rewards</div>
                  {data.rewardsLive ? (
                    <div className="space-y-1 mt-1">
                      <div className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground tabular-nums">
                        {usd(data.claimableUsd ?? 0)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {usd(data.earnedUsd ?? 0)} total earned · minimum payout {usd(data.minClaimUsd ?? 0)}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 mt-2">
                      <div className="text-sm font-semibold text-foreground">Upcoming Protocol Milestone</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Fee rewards distribution goes live in the next protocol milestone. All referred volume and trader actions are actively tracked on-chain.
                      </p>
                    </div>
                  )}
                </div>

                {data.rewardsLive && (
                  <div className="pt-2 mt-auto">
                    <Button
                      size="sm"
                      disabled={busy || !canClaim}
                      onClick={() => void claim()}
                      className="gap-1.5 shadow-xs text-xs h-8 cursor-pointer"
                    >
                      <Gift className="size-3.5" />
                      <span>{busy ? 'Processing...' : 'Claim to My Wallet'}</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  );
};

export default Page;
