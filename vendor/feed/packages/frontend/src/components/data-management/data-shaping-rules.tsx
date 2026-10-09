// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { CircleHelp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { DataShapingRule } from '@/types/procurement';
import { flagLabel } from './data-shaping-rule-dialog';

const sourceLabel = (source: string | null) => {
  if (!source) return 'every source';
  if (source === 'ofb') return 'OFB Completed Orders';
  if (source === 'ofb_pickup') return 'OFB Agency Pickups';
  if (source === 'legacy_community') return 'legacy community records';
  return source;
};

/** Plain-language restatement of what a rule matches, so nobody has to read the fields. */
function describeScope(rule: DataShapingRule): string {
  const parts: string[] = [];
  switch (rule.scope) {
    case 'donor':
      parts.push(`Donations from ${rule.donorName ?? rule.donorCode}`);
      if (rule.donorName && rule.donorCode) parts.push(`(code ${rule.donorCode})`);
      break;
    case 'category':
      parts.push(`Lines with product code ${rule.productCode}`);
      break;
    case 'date_range':
      parts.push('Everything received');
      break;
    case 'event':
      parts.push(`One event (revision ${rule.orderRevisionId})`);
      break;
    default:
      break;
  }
  if (rule.startDate && rule.endDate) parts.push(`between ${rule.startDate} and ${rule.endDate}`);
  else if (rule.startDate) parts.push(`from ${rule.startDate}`);
  else if (rule.endDate) parts.push(`until ${rule.endDate}`);
  parts.push(`· ${sourceLabel(rule.source)}`);
  return parts.join(' ');
}

interface DataShapingRulesProps {
  rules: DataShapingRule[];
  isLoading: boolean;
  onAdd: () => void;
  onEdit: (rule: DataShapingRule) => void;
  onToggle: (rule: DataShapingRule, enabled: boolean) => void;
  onDelete: (rule: DataShapingRule) => void;
  /**
   * Whether to offer the authoring controls at all. Rules change what
   * Analytics counts, so creating, editing, and deleting them are
   * administrator actions (ISSUES.md #50a) that the server refuses for
   * Staff. Rules stay *visible* to everyone — a staff member reading a
   * total deserves to see what has been excluded from it.
   */
  canManage: boolean;
}

export function DataShapingRules({
  rules,
  isLoading,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
  canManage,
}: DataShapingRulesProps) {
  const exclusions = rules.filter(
    (rule) => rule.flag === 'pass_through' || rule.flag === 'other_exclusion'
  );

  return (
    <section className="min-w-0 space-y-4 border-b pb-6">
      <div className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-lg font-semibold leading-none tracking-tight">Data Rules</h3>
            {/* The detail belongs here rather than in the card: it answers a
                question staff ask once, and on screen it crowded the rules
                themselves. */}
            {/* Self-provided, like ShoppingListList and DocumentList: the
                component should not depend on an ancestor provider it cannot
                guarantee. Nested providers are supported. */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="About data rules"
                  >
                    <CircleHelp className="h-4 w-4" aria-hidden="true" />
                  </button>
              </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Rules never change or delete imported data. They add context
                  that Analytics reads, and they apply to past and future
                  imports alike.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">How your agency reads its own data.</p>
        </div>
        {canManage && (
          <Button size="sm" onClick={onAdd} className="shrink-0">
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Add Rule
          </Button>
        )}
      </div>
      <div>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading rules…</p>
        ) : rules.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center">
            <p className="text-sm font-medium">No rules yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              FEED counts everything it imports. Add a rule when your operation knows something the
              data does not — for example, that a donor&apos;s pickups are couriered to another
              agency and were never your inventory.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        rule.flag === 'pass_through' || rule.flag === 'other_exclusion'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {flagLabel(rule.flag)}
                    </Badge>
                    {!rule.enabled && <Badge variant="outline">Paused</Badge>}
                  </div>
                  <p className="mt-1 text-sm">{describeScope(rule)}</p>
                  {rule.note && (
                    <p className="mt-1 text-xs text-muted-foreground">{rule.note}</p>
                  )}
                </div>
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(checked) => onToggle(rule, checked)}
                      aria-label={`${rule.enabled ? 'Pause' : 'Enable'} rule`}
                    />
                    <Button variant="ghost" size="icon" onClick={() => onEdit(rule)} aria-label="Edit rule">
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(rule)} aria-label="Delete rule">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ) : (
                  // Staff still need to know whether a rule is in force, since
                  // it changes the totals they are reading.
                  <Badge variant={rule.enabled ? 'secondary' : 'outline'} className="shrink-0">
                    {rule.enabled ? 'Active' : 'Paused'}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}

        {exclusions.length > 0 && (
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            {exclusions.length} rule{exclusions.length === 1 ? ' removes' : 's remove'} weight from
            supply totals. Analytics states what was excluded wherever it applies — excluded weight
            is never silently dropped.
          </p>
        )}
      </div>
    </section>
  );
}
