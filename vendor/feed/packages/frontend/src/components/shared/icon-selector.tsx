// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  foodIcons,
  ICON_CATEGORY_LABELS,
  type IconCategory,
} from '@/lib/icon-library';
import { cn } from '@/lib/utils';

interface IconSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const categoryOrder: IconCategory[] = [
  'food',
  'drink',
  'health',
  'household',
  'clothing',
  'pets',
  'shapes',
  'outdoor',
  'other',
];

export function IconSelector({ value, onChange, disabled = false }: IconSelectorProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredIcons = normalizedSearch
    ? foodIcons.filter((icon) => (
      icon.label.toLowerCase().includes(normalizedSearch)
      || icon.value.toLowerCase().includes(normalizedSearch)
    ))
    : foodIcons;
  const groupedIcons = categoryOrder
    .map((category) => ({
      category,
      icons: filteredIcons.filter((icon) => icon.category === category),
    }))
    .filter((group) => group.icons.length > 0);
  const selected = foodIcons.find((icon) => icon.value === value);

  return (
    <div className="space-y-3">
      <Input
        type="search"
        placeholder="Search icons…"
        aria-label="Search icons"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        disabled={disabled}
      />

      <ScrollArea className="h-24 rounded-md border">
        <div className="space-y-4 p-3">
          {groupedIcons.map((group) => (
            <div key={group.category} className="space-y-2">
              <h4 className="text-sm font-medium">
                {ICON_CATEGORY_LABELS[group.category]
                  ?? group.category.charAt(0).toUpperCase() + group.category.slice(1)}
              </h4>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                {group.icons.map((icon) => {
                  const Icon = icon.component;
                  const isSelected = value === icon.value;
                  return (
                    <button
                      key={icon.value}
                      type="button"
                      aria-label={`Select ${icon.label} icon`}
                      aria-pressed={isSelected}
                      title={icon.label}
                      disabled={disabled}
                      onClick={() => onChange(icon.value)}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                        isSelected
                          ? 'bg-primary/10 ring-1 ring-primary'
                          : 'hover:bg-accent',
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {filteredIcons.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">No icons found</div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-2 text-sm">
        <Label>Selected:</Label>
        {selected ? (
          <span className="flex items-center gap-1.5">
            <selected.component className="h-4 w-4" aria-hidden="true" />
            {selected.label}
          </span>
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
      </div>
    </div>
  );
}
