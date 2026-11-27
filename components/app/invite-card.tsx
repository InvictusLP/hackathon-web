'use client';

import { useState } from 'react';
import { Plus, Trash2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { post } from '@/lib/api';
import { useFetch } from '@/lib/use-live';
import { ago } from '@/lib/format';
import type { Invite } from '@/lib/types';

/**
 * The guest list.
 *
 * A Telegram username is not an identity - people change them, and a released
 * one can be claimed by somebody else. So an invite is a door that opens once:
 * the account that walks through it keeps the access, and the name it used
 * stops mattering the moment it is spent.
 */
export const InviteCard = ({
  inviteOnly,
  onToggle,
  busy,
}: {
  inviteOnly: boolean;
  onToggle: (v: boolean) => void;
  busy: boolean;
}) => {
  const { data, reload } = useFetch<{ rows: Invite[] }>('/api/admin/invites');
  const [username, setUsername] = useState('');
  const [working, setWorking] = useState(false);

  const call = async (path: string, body: unknown, ok: string): Promise<void> => {
    setWorking(true);
    try {
      await post(path, body);
      toast.success(ok);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'that did not work');
    } finally {
      setWorking(false);
    }
  };

  const rows = data?.rows ?? [];
  const open = rows.filter((r) => r.usedBy === null);

  return (
    <Card className="border-border/70 bg-card/60 shadow-xs">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="text-base font-semibold">Access Control</CardTitle>
        <CardDescription className="text-xs">Manage user registration and invite-only access gates.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-48 flex-1">
            <div className="text-sm font-medium">Invite only</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              Off means anyone who finds the bot can register. An account id survives a
              rename and works without a username, so it is the safer handle.
            </div>
          </div>
          <Switch checked={inviteOnly} disabled={busy} onCheckedChange={onToggle} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            value={username}
            placeholder="@username or 5025629337"
            spellCheck={false}
            className="min-w-48 flex-1"
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !username.trim()) return;
              void call('/api/admin/invite', { username: username.trim() }, 'Invited').then(() =>
                setUsername(''),
              );
            }}
          />
          <Button
            disabled={working || !username.trim()}
            onClick={() =>
              void call('/api/admin/invite', { username: username.trim() }, 'Invited').then(() =>
                setUsername(''),
              )
            }
          >
            <Plus className="size-4" />
            Invite
          </Button>
        </div>

        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs">
            {open.length} waiting · {rows.length - open.length} redeemed
          </div>
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center select-none">Nobody invited yet</p>
          )}
          {/* Its own scroll, so a long list does not push the rest of the admin page away. */}
          <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r) => (
            <div
              key={r.username}
              className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-medium">@{r.username}</span>
              {r.usedBy === null ? (
                <>
                  <span className="text-muted-foreground shrink-0 text-xs">{ago(r.createdAt)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive size-7 shrink-0"
                    aria-label={`Withdraw invite for ${r.username}`}
                    disabled={working}
                    onClick={() =>
                      void call('/api/admin/invite/remove', { username: r.username }, 'Invite withdrawn')
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              ) : (
                <Badge variant="secondary" className="shrink-0 gap-1">
                  <UserCheck className="size-3" />#{r.usedBy}
                </Badge>
              )}
            </div>
          ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
