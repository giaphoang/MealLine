// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import {
  Building2, CircleCheck, Image as ImageIcon, Palette,
  Sparkles, Users,
} from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis } from 'recharts';
import { StepWrapper } from '@/components/ai-configuration/shared/StepWrapper';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  resolveBrandAssetReference,
  useBrandPreview,
  type BrandConfigurationPayload,
  type Oklch,
} from '@/contexts/BrandContext';
import { hexToOklch } from '@/lib/brand-color';
import { cn } from '@/lib/utils';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { TailwindColorField } from './tailwind-color-field';
import { brandService, type BrandPreview, type PaletteEntry } from '@/services/brand';
import { messageService } from '@/services/message';
import { extractPaletteFromImage } from './palette-extract';

export type AppearanceTemplate = {
  id: string;
  name: string;
  description: string;
  config: BrandConfigurationPayload;
};

export type AppearanceDraft = {
  id: string;
  config: BrandConfigurationPayload;
  startSource: string | null;
};

const scratchConfig = (): BrandConfigurationPayload => ({
  schemaVersion: 1,
  identity: {
    organizationName: 'Your Organization',
    appName: 'FEED',
    tagline: 'Food Equity & Efficient Delivery',
    description: 'Food pantry management software for non-profits.',
    organizationWebsite: 'https://example.org/',
  },
  logo: {
    // A neutral placeholder, never another agency's mark. Starting "from
    // scratch" pre-filled with the St. Johns Food Share logo implied FEED had
    // guessed the organization, and an operator who skipped the upload step
    // would have shipped someone else's identity.
    light: { kind: 'builtin', src: '/brand/placeholder-mark.svg', width: 640, height: 220 },
    dark: { kind: 'builtin', src: '/brand/placeholder-mark.svg', width: 640, height: 220 },
  },
  colors: {
    accent: { l: 0.55, c: 0.04, h: 250 },
    neutral: { l: 0.45, c: 0.01, h: 250 },
    hierarchy: [{ l: 0.55, c: 0.04, h: 250 }],
  },
  staff: {
    signInTitle: 'Sign in to Your Organization',
    emailGuidance: 'Staff access — use your authorized work email',
    emailPlaceholder: 'you@your-organization.org',
  },
  // Retained in the payload so saved configurations and portable backups keep
  // their shape, but no longer a wizard step. Whether the public inventory page
  // is served is a deployment capability, not brand identity — in LOTTO the
  // toggle exists because a queue-only agency has no FEED at all, whereas here
  // the endpoint is FEED's own feature. Its control belongs in Data Management,
  // alongside the other administrator data-sharing settings.
  capabilities: { publicInventory: true },
  terminology: {
    pantrySingular: 'food pantry', pantryPlural: 'food pantries',
    clientSingular: 'client', clientPlural: 'clients',
    departmentName: 'Social Services', active: false,
  },
});

/**
 * What each slot is for, in slot order. Mirrors `STORY_SLOTS` on the server;
 * the wizard needs a name for a slot even before a colour is in it, which the
 * derived label cannot give because there is nothing yet to derive from.
 */
const SLOT_LABELS = [
  'Main colour — buttons, links, and selection',
  'Accent — hover surfaces and secondary highlights',
  'Background tint',
  'Dark anchor — dark-mode surfaces',
  'Light anchor — light-mode page surface',
];

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
const replaceSection = <K extends keyof BrandConfigurationPayload>(
  config: BrandConfigurationPayload,
  key: K,
  value: BrandConfigurationPayload[K],
): BrandConfigurationPayload => ({ ...config, [key]: value });

const Choice = ({ selected, title, description, onClick, disabled }: {
  selected: boolean; title: string; description: string; onClick: () => void; disabled: boolean;
}) => (
  <button
    type="button"
    aria-pressed={selected}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'w-full rounded-lg border p-3 text-left transition-colors',
      selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50'
    )}
  >
    <span className="font-medium">{title}</span>
    <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
  </button>
);

function StartStep({ draft, templates, change, busy }: WizardStepProps) {
  return (
    <StepWrapper icon={Sparkles} title="Set up your appearance" description="Start with an example or a neutral slate. Every choice stays editable.">
      <div className="space-y-2">
        {templates.map((template) => (
          <Choice
            key={template.id}
            selected={draft.startSource === template.id}
            title={template.name}
            description={template.description}
            disabled={busy}
            onClick={() => change({ startSource: template.id, config: structuredClone(template.config) })}
          />
        ))}
        <Choice
          selected={draft.startSource === 'scratch'}
          title="Start from scratch"
          description="A restrained neutral identity ready for your organization’s artwork and colors."
          disabled={busy}
          onClick={() => change({ startSource: 'scratch', config: scratchConfig() })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="brand-config-id">Configuration name</Label>
        <Input id="brand-config-id" value={draft.id} onChange={(event) => change({ id: slugify(event.target.value) })} placeholder="my-organization" maxLength={64} spellCheck={false} disabled={busy} />
        <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and dashes. The name identifies this saved draft.</p>
      </div>
    </StepWrapper>
  );
}

function IdentityStep({ draft, change, busy }: WizardStepProps) {
  const identity = draft.config.identity;
  const terminology = draft.config.terminology ?? {
    pantrySingular: 'food pantry', pantryPlural: 'food pantries',
    clientSingular: 'client', clientPlural: 'clients',
    departmentName: 'Social Services', active: false,
  };
  const update = (values: Partial<typeof identity>) => change({
    config: replaceSection(draft.config, 'identity', { ...identity, ...values }),
  });
  const updateTerminology = (values: Partial<typeof terminology>) => change({
    config: { ...draft.config, terminology: { ...terminology, ...values } },
  });
  return (
    <StepWrapper icon={Building2} title="Organization identity" description="The names and copy used on the home page, browser title, sign-in, and About surface.">
      {([
        // No tagline. "Food Equity & Efficient Delivery" spells FEED — it is
        // the product's name written out, not copy an agency supplies.
        ['organizationName', 'Organization name'], ['appName', 'App name'],
        ['organizationWebsite', 'Organization website'],
      ] as const).map(([key, label]) => (
        <div className="space-y-1.5" key={key}>
          <Label htmlFor={`brand-${key}`}>{label}</Label>
          <Input id={`brand-${key}`} type={key === 'organizationWebsite' ? 'url' : 'text'} value={identity[key]} onChange={(event) => update({ [key]: event.target.value })} maxLength={key === 'organizationWebsite' ? 500 : 120} disabled={busy} />
        </div>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="brand-description">Description</Label>
        <Textarea id="brand-description" value={identity.description} onChange={(event) => update({ description: event.target.value })} rows={3} maxLength={300} disabled={busy} />
      </div>
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="brand-terminology-active">Organization terminology</Label>
            <p className="text-xs text-muted-foreground">Use the words your organization uses for its pantry, clients, and service department.</p>
          </div>
          <Switch id="brand-terminology-active" checked={terminology.active} onCheckedChange={(active) => updateTerminology({ active })} disabled={busy} />
        </div>
        {terminology.active ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ['pantrySingular', 'Pantry term — singular'],
              ['pantryPlural', 'Pantry term — plural'],
              ['clientSingular', 'Client term — singular'],
              ['clientPlural', 'Client term — plural'],
              ['departmentName', 'Service department name'],
            ] as const).map(([key, label]) => (
              <div className="space-y-1.5" key={key}>
                <Label htmlFor={`brand-${key}`}>{label}</Label>
                <Input id={`brand-${key}`} value={terminology[key]} onChange={(event) => updateTerminology({ [key]: event.target.value })} maxLength={key === 'departmentName' ? 100 : 60} disabled={busy} />
              </div>
            ))}
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Preview: {`Daily ${terminology.pantrySingular} work · Total ${terminology.clientPlural} · ${terminology.departmentName}`}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Off uses FEED’s built-in food pantry, client, and Social Services vocabulary without deleting these saved terms.</p>
        )}
      </div>
    </StepWrapper>
  );
}

function LogosStep({ draft, change, busy }: WizardStepProps) {
  const [uploading, setUploading] = React.useState<string | null>(null);
  const fileInputs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const upload = async (kind: 'logo-light' | 'logo-dark' | 'square', file: File) => {
    setUploading(kind);
    try {
      const uploaded = await brandService.upload(kind, file);
      const logo = { ...draft.config.logo };
      if (kind === 'logo-light') {
        logo.light = uploaded.asset;
        // The detector reports what it measured; adopting it here means the
        // common case needs no decision, and the control below still lets
        // someone override it either way.
        if (uploaded.presentation) logo.presentation = uploaded.presentation.suggested;
      }
      else if (kind === 'logo-dark') logo.dark = uploaded.asset;
      else {
        logo.square = uploaded.asset;
        const size64 = uploaded.derivatives.find((asset) => asset.width === 64);
        const size192 = uploaded.derivatives.find((asset) => asset.width === 192);
        const size512 = uploaded.derivatives.find((asset) => asset.width === 512);
        if (size64 && size192 && size512) logo.squareDerivatives = { size64, size192, size512 };
      }
      change({ config: replaceSection(draft.config, 'logo', logo) });
      messageService.success(kind === 'square' ? 'App mark uploaded and icon sizes generated.' : `${kind === 'logo-light' ? 'Light' : 'Dark'}-mode logo uploaded.`);
      uploaded.warnings.forEach((warning) => messageService.warning(warning));
      if (uploaded.presentation?.suggested === 'dark-surface') {
        messageService.info(uploaded.presentation.reason);
      }
    } catch (error) {
      ErrorHandlerService.handleError(error, 'brandUploadAsset');
    } finally { setUploading(null); }
  };
  const slot = (scope: 'light' | 'dark') => {
    const reference = draft.config.logo[scope];
    // The plate is a light-mode device, so the preview only shows it on the
    // light slot — which is also the only place the choice is legible. Seeing
    // the two side by side is the point: a white mark on the light swatch is
    // exactly the failure the plate exists to fix.
    const plated = scope === 'light' && draft.config.logo.presentation === 'dark-surface';
    // An SVG exported with only a `viewBox` has no intrinsic size. Inside the
    // shrink-to-fit plate that collapses the image to nothing, leaving a bare
    // dark pill — and stating width/height alone does not fix it, because the
    // width attribute then sizes the box to the artboard while `max-h` caps
    // only the height. Declaring the ratio and driving off a definite height
    // is independent of whether the file carries dimensions at all.
    const image = (
      <img
        src={resolveBrandAssetReference(reference)}
        alt={`${scope} logo preview`}
        width={reference.width}
        height={reference.height}
        style={{ aspectRatio: `${reference.width} / ${reference.height}` }}
        className="h-14 w-auto max-w-full object-contain"
      />
    );
    return (
      <div className={cn('flex h-24 flex-1 items-center justify-center rounded-lg border p-3', scope === 'light' ? 'bg-white' : 'bg-slate-950')}>
        {plated ? (
          // Same construction as BrandLogo: the plate is an out-of-flow
          // backdrop, so the preview shows the mark exactly where it will sit
          // rather than nudged by padding the real thing does not apply.
          <span className="relative isolate inline-flex items-center justify-center">
            <span
              aria-hidden
              style={{ inset: '-8px -12px', zIndex: -1 }}
              className="pointer-events-none absolute rounded-xl bg-slate-900"
            />
            {image}
          </span>
        ) : (
          image
        )}
      </div>
    );
  };
  const resolutionWarning = (kind: 'logo-light' | 'logo-dark' | 'square') => {
    const reference = kind === 'logo-light'
      ? draft.config.logo.light
      : kind === 'logo-dark'
        ? draft.config.logo.dark
        : draft.config.logo.square;
    if (!reference || reference.kind !== 'database' || reference.mimeType === 'image/svg+xml') return null;
    const minimumWidth = kind === 'square' ? 512 : 576;
    const minimumHeight = kind === 'square' ? 512 : 160;
    if (reference.width >= minimumWidth && reference.height >= minimumHeight) return null;
    return `Current image: ${reference.width} × ${reference.height} px. For a crisp ${kind === 'square' ? 'app mark' : 'logo'} on high-density screens, use SVG or a PNG at least ${minimumWidth} × ${minimumHeight} px.`;
  };
  const input = (kind: 'logo-light' | 'logo-dark' | 'square', label: string) => {
    const warning = resolutionWarning(kind);
    // The native control is cleared the moment a file is handed over, so that
    // re-picking the same file still fires `change` — otherwise a corrected
    // re-upload would silently do nothing. That leaves it permanently reading
    // "No file chosen", so the saved filename is shown alongside it. It is
    // also the more truthful thing to display: what is stored, not what
    // happens to be sitting in the input.
    const reference = kind === 'logo-light'
      ? draft.config.logo.light
      : kind === 'logo-dark'
        ? draft.config.logo.dark
        : draft.config.logo.square;
    const stored = reference && reference.kind === 'database' ? reference.filename : null;
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`brand-${kind}`}>{label}</Label>
        {/*
          * A native file input renders its own "No file chosen" in shadow DOM,
          * which cannot be changed — and it is always wrong here, because the
          * control is cleared the moment the file is handed over so that
          * re-picking the same file still fires `change`. Naming the file
          * beneath it left two contradictory labels on screen. So the input is
          * kept for behaviour and accessibility but visually replaced: a
          * button opens it, and the slot states what is actually stored.
          */}
        <input
          id={`brand-${kind}`}
          ref={(node) => { fileInputs.current[kind] = node; }}
          type="file"
          className="sr-only"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={busy || uploading !== null}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void upload(kind, file);
          }}
        />
        <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || uploading !== null}
            onClick={() => fileInputs.current[kind]?.click()}
          >
            Choose file
          </Button>
          <span
            className={cn('truncate text-sm', stored ? 'font-mono' : 'text-muted-foreground')}
            title={stored ?? undefined}
          >
            {uploading === kind ? 'Uploading…' : stored ?? 'No file chosen'}
          </span>
        </div>
        {warning ? (
          <p className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-1.5 text-xs text-[var(--status-warning-text)]" role="status">
            {warning}
          </p>
        ) : null}
      </div>
    );
  };
  return (
    <StepWrapper icon={ImageIcon} title="Logos & app mark" description="SVGs stay crisp at every size after unsafe content is removed. Raster images keep their original dimensions. All uploads stay with database backups.">
      <div className="flex flex-col gap-2 sm:flex-row">{slot('light')}{slot('dark')}</div>
      <div className="space-y-1.5 rounded-lg border p-3">
        <Label htmlFor="brand-logo-presentation">Light-mode background</Label>
        <select
          id="brand-logo-presentation"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={draft.config.logo.presentation ?? 'transparent'}
          disabled={busy}
          onChange={(event) =>
            change({
              config: replaceSection(draft.config, 'logo', {
                ...draft.config.logo,
                presentation: event.target.value as 'transparent' | 'dark-surface',
              }),
            })
          }
        >
          <option value="transparent">Place directly on the page</option>
          <option value="dark-surface">Give the logo a dark plate</option>
        </select>
        <p className="text-xs text-muted-foreground">
          A logo drawn in white on a transparent background disappears on a light page. A
          dark plate keeps it readable. Dark mode never uses the plate, because the page is
          already dark. FEED checks the light logo when you upload it and picks for you.
        </p>
      </div>
      {input('logo-light', 'Light-mode logo')}
      {input('logo-dark', 'Dark-mode logo')}
      {input('square', 'Square app mark')}
      <p className="text-xs text-muted-foreground">Use PNG, JPEG, WebP, or SVG up to 4 MB. The square mark may be at most 20% wider than it is tall.</p>
    </StepWrapper>
  );
}

function ThemePreview({ preview }: { preview: BrandPreview | null }) {
  if (!preview) return <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Deriving the accessible theme…</div>;
  const values = [48, 72, 57, 83, 65].map((value, index) => ({ name: `${index + 1}`, value }));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(['light', 'dark'] as const).map((scope) => {
        const tokens = preview.tokens[scope];
        return (
          <div key={scope} className="space-y-2 rounded-xl p-3" style={{ background: tokens.background, color: tokens.foreground }}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{scope}</p>
            <div className="rounded-lg border p-2 text-xs" style={{ background: tokens.card, color: tokens['card-foreground'], borderColor: tokens.border }}>Accurate data on a derived card surface.</div>
            <button type="button" tabIndex={-1} className="w-full cursor-default rounded-md px-2 py-1.5 text-sm font-medium" style={{ background: tokens.primary, color: tokens['primary-foreground'] }}>Primary action</button>
            <div className="h-24" aria-label={`${scope} chart preview`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={values} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="name" hide />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {values.map((_, index) => <Cell key={index} fill={preview.chartColors[scope][index]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ColorsStep({ draft, change, busy }: WizardStepProps) {
  const [selected, setSelected] = React.useState(0);
  const [preview, setPreview] = React.useState<BrandPreview | null>(null);
  const [extracting, setExtracting] = React.useState(false);
  // Immutable and shared by every row, so it is fetched once for the step.
  const [palette, setPalette] = React.useState<PaletteEntry[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    brandService.palette()
      .then((entries) => { if (!cancelled) setPalette(entries); })
      .catch(() => { if (!cancelled) setPalette([]); });
    return () => { cancelled = true; };
  }, []);
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      brandService.preview(draft.config).then(({ preview: next }) => setPreview(next)).catch(() => setPreview(null));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [draft.config]);
  const setHierarchy = (hierarchy: Oklch[]) => change({
    config: replaceSection(draft.config, 'colors', {
      ...draft.config.colors,
      hierarchy,
      accent: hierarchy[0],
      /*
       * Editing the ranks makes the story the source of truth, so every pinned
       * value from wherever the draft started has to go with it.
       *
       * Only `accentFamily` was cleared. A draft begun from the William Temple
       * House template carried its `accentDark` (the gold) and its `neutral`
       * forward through every subsequent edit — and `neutralTargetFor` returns
       * an explicit `neutral` before it ever consults the surface anchors. So
       * dark mode stayed locked to the template's identity and ranks 4 and 5
       * did nothing, while light mode tracked the new colours. There is no
       * control for either field in this wizard, so carrying them silently was
       * never going to be visible to the person it was overriding.
       */
      accentFamily: undefined,
      accentDark: undefined,
      accentDarkFamily: undefined,
      neutral: undefined,
      neutralFamily: undefined,
    }),
  });
  // Palette entries arrive as hex on the wire because that is what a swatch
  // needs to paint; the draft still stores OKLCH, and the value round-trips
  // through snapping unchanged because it is already a palette stop.
  const chooseEntry = (index: number, entry: PaletteEntry) => {
    const parsed = hexToOklch(entry.color);
    if (!parsed) return;
    const hierarchy = [...draft.config.colors.hierarchy];
    hierarchy[index] = parsed;
    setHierarchy(hierarchy);
  };
  const extract = async () => {
    setExtracting(true);
    const entries = await extractPaletteFromImage(resolveBrandAssetReference(draft.config.logo.light));
    setExtracting(false);
    if (!entries.length) {
      messageService.error('FEED could not read colors from that logo. Add colors manually or upload a PNG copy.');
      return;
    }
    setHierarchy(entries.slice(0, 5).map((entry) => entry.color));
    setSelected(0);
  };
  return (
    <StepWrapper icon={Palette} title="Brand color story" description="Rank the organization’s colors. FEED snaps them to a proven accessible palette and shows the closest families.">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void extract()} disabled={busy || extracting}>{extracting ? 'Reading logo…' : 'Extract from light logo'}</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => {
          if (draft.config.colors.hierarchy.length >= 5) return;
          setHierarchy([...draft.config.colors.hierarchy, { l: 0.65, c: 0.08, h: 200 }]);
          setSelected(draft.config.colors.hierarchy.length);
        }} disabled={busy || draft.config.colors.hierarchy.length >= 5}>Add color</Button>
      </div>
      <div className="space-y-2">
        {draft.config.colors.hierarchy.map((color, index) => (
          <div key={index} className={cn('flex items-center gap-2 rounded-lg border p-2', selected === index && 'ring-2 ring-ring')}>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <TailwindColorField
                label={`Brand color ${index + 1}`}
                value={preview?.hierarchy?.[index]?.name ?? null}
                nearby={preview?.hierarchy?.[index]?.nearby ?? []}
                palette={palette}
                disabled={busy || palette.length === 0}
                onSelect={(entry) => { setSelected(index); chooseEntry(index, entry); }}
              />
              {/*
                * What this rank actually drives. The order was doing real work
                * — chromatics take primary then accent, the first dark neutral
                * anchors dark surfaces, the first light one anchors light —
                * and none of it was visible, so ranking looked arbitrary and
                * the result looked random. The roles are the explanation, and
                * they are read from the same assignment the derivation acts
                * on rather than guessed from the position.
                */}
              <span className="truncate text-xs text-muted-foreground" title={preview?.hierarchy?.[index]?.roleLabel ?? undefined}>
                {preview?.hierarchy?.[index]?.roleLabel ?? SLOT_LABELS[index] ?? ''}
              </span>
              {preview?.hierarchy?.[index]?.roleWarning ? (
                <span className="text-xs text-[var(--status-warning-text)]">
                  {preview.hierarchy[index].roleWarning}
                </span>
              ) : null}
            </div>
            {/*
              * No reordering. Each row is a slot with a fixed job, so there is
              * no order to change — and the arrows that used to be here implied
              * control they did not have, because the role followed the
              * colour's kind rather than its position.
              *
              * Only the last slot can be dropped, so the remaining rows never
              * shift and no colour silently changes job.
              */}
            {index === draft.config.colors.hierarchy.length - 1 && index > 0 ? (
              <Button type="button" variant="ghost" size="sm" aria-label={`Clear ${SLOT_LABELS[index] ?? `color ${index + 1}`}`} onClick={() => { setHierarchy(draft.config.colors.hierarchy.slice(0, -1)); setSelected(0); }} disabled={busy}>Clear</Button>
            ) : null}
          </div>
        ))}
      </div>
      {preview ? (
        <div className="space-y-2">
          {/*
            * An override, and it has to be able to say "no override".
            *
            * This offered three families and nothing else: clicking one wrote
            * `accentFamily` and only editing a colour ever cleared it, so the
            * control was write-only and read as a required three-way choice —
            * including on a grayscale brand, where being asked to pick a
            * "color family" at all suggests the greys are not going to survive.
            * The families offered do follow the colour now, so a grey brand is
            * offered greys, but the shape of the control was still wrong.
            *
            * Automatic is the default and is selectable, the nearest families
            * stay as quick picks because they are genuinely the useful ones,
            * and every remaining family is reachable rather than 3 of 26.
            */}
          <Label htmlFor="brand-accent-family">Accent color family</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={draft.config.colors.accentFamily ? 'outline' : 'default'}
              disabled={busy}
              onClick={() => change({ config: replaceSection(draft.config, 'colors', { ...draft.config.colors, accentFamily: undefined }) })}
            >
              Automatic
            </Button>
            {preview.alternates.map((alternate) => (
              <Button key={alternate.family} type="button" variant={draft.config.colors.accentFamily === alternate.family ? 'default' : 'outline'} size="sm" onClick={() => change({ config: replaceSection(draft.config, 'colors', { ...draft.config.colors, accentFamily: alternate.family }) })} disabled={busy}>
                <span className="mr-2 h-3 w-3 rounded-full border border-current" style={{ background: alternate.color }} />{alternate.family}
              </Button>
            ))}
            <select
              id="brand-accent-family"
              aria-label="Accent color family"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={draft.config.colors.accentFamily ?? ''}
              disabled={busy}
              onChange={(event) => change({ config: replaceSection(draft.config, 'colors', { ...draft.config.colors, accentFamily: event.target.value || undefined }) })}
            >
              <option value="">Automatic ({preview.families.accent})</option>
              {[...new Set(palette.map((entry) => entry.family))].map((family) => (
                <option key={family} value={family}>{family}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Automatic uses the family nearest your first color — {preview.families.accent}. Override
            it only when the nearest match is not the family your brand actually uses.
          </p>
          {preview.families.mudEscapedFrom ? (
            <p className="text-xs text-muted-foreground">
              {preview.families.mudEscapedFrom} has no usable dark surface — it goes brown at that
              depth — so hover and active states use {preview.families.secondary} instead.
            </p>
          ) : null}
        </div>
      ) : null}
      <ThemePreview preview={preview} />
    </StepWrapper>
  );
}

function StaffStep({ draft, change, busy }: WizardStepProps) {
  const staff = draft.config.staff;
  const update = (values: Partial<typeof staff>) => change({ config: replaceSection(draft.config, 'staff', { ...staff, ...values }) });
  return (
    <StepWrapper icon={Users} title="Staff sign-in copy" description="Keep sign-in instructions specific to the organization and the staff who use it.">
      {([
        ['signInTitle', 'Sign-in title'], ['emailGuidance', 'Email guidance'], ['emailPlaceholder', 'Email placeholder'],
      ] as const).map(([key, label]) => (
        <div className="space-y-1.5" key={key}>
          <Label htmlFor={`brand-${key}`}>{label}</Label>
          <Input id={`brand-${key}`} value={staff[key]} onChange={(event) => update({ [key]: event.target.value })} maxLength={160} disabled={busy} />
        </div>
      ))}
    </StepWrapper>
  );
}

function ReviewStep({ draft }: WizardStepProps) {
  const facts = [
    ['Configuration', draft.id], ['Organization', draft.config.identity.organizationName],
    ['App name', draft.config.identity.appName], ['Website', draft.config.identity.organizationWebsite],
  ];
  return (
    <StepWrapper icon={CircleCheck} title="Review & save" description="Save a draft to keep working, or activate it to apply the identity and derived theme across FEED.">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {facts.map(([label, value]) => <React.Fragment key={label}><dt className="font-medium text-muted-foreground">{label}</dt><dd className="min-w-0 truncate">{value}</dd></React.Fragment>)}
      </dl>
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">Activation changes organization-wide presentation. Authentication, shared data, audit rules, and protected operational status colors do not change.</div>
    </StepWrapper>
  );
}

type WizardStepProps = {
  draft: AppearanceDraft;
  templates: AppearanceTemplate[];
  change: (updates: Partial<AppearanceDraft>) => void;
  busy: boolean;
};

const STEP_DEFINITIONS = [
  { id: 'start', description: 'Choose a starting point.', component: StartStep, valid: (draft: AppearanceDraft) => draft.id.length >= 2 && draft.startSource !== null },
  { id: 'identity', description: 'Set organization identity.', component: IdentityStep, valid: (draft: AppearanceDraft) => {
    const identityComplete = Boolean(draft.config.identity.organizationName.trim() && draft.config.identity.appName.trim());
    const terminology = draft.config.terminology;
    const terminologyComplete = !terminology?.active || Boolean(
      terminology.pantrySingular.trim() && terminology.pantryPlural.trim()
      && terminology.clientSingular.trim() && terminology.clientPlural.trim()
      && terminology.departmentName.trim(),
    );
    return identityComplete && terminologyComplete;
  } },
  { id: 'logos', description: 'Choose logos and an app mark.', component: LogosStep, valid: () => true },
  { id: 'colors', description: 'Build an accessible color story.', component: ColorsStep, valid: (draft: AppearanceDraft) => draft.config.colors.hierarchy.length > 0 },
  { id: 'staff', description: 'Write staff sign-in guidance.', component: StaffStep, valid: (draft: AppearanceDraft) => Boolean(draft.config.staff.signInTitle.trim() && draft.config.staff.emailGuidance.trim() && draft.config.staff.emailPlaceholder.trim()) },
  { id: 'review', description: 'Review and save.', component: ReviewStep, valid: (draft: AppearanceDraft) => draft.id.length >= 2 },
] as const;

export function AppearanceWizard({ open, onOpenChange, templates, existingDraft, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: AppearanceTemplate[];
  existingDraft?: AppearanceDraft | null;
  onSaved: () => void;
}) {
  const brandPreview = useBrandPreview();
  const [draft, setDraft] = React.useState<AppearanceDraft>({ id: '', config: scratchConfig(), startSource: null });
  const [stepIndex, setStepIndex] = React.useState(0);
  const [saving, setSaving] = React.useState<'draft' | 'activate' | null>(null);
  const steps = existingDraft ? STEP_DEFINITIONS.slice(1) : STEP_DEFINITIONS;
  const current = steps[stepIndex];
  React.useEffect(() => {
    if (!open) return;
    setDraft(existingDraft ? structuredClone(existingDraft) : { id: '', config: scratchConfig(), startSource: null });
    setStepIndex(0);
    setSaving(null);
  }, [open, existingDraft]);
  if (!current) return null;
  const Step = current.component;
  const valid = current.valid(draft);
  const busy = saving !== null;
  const save = async (activate: boolean) => {
    setSaving(activate ? 'activate' : 'draft');
    try {
      await brandService.save(draft.id, draft.config, activate);
      messageService.success(activate ? 'Appearance saved and activated for FEED.' : 'Appearance saved as a draft.');
      onSaved();
      onOpenChange(false);
      if (activate) window.location.reload();
    } catch (error) {
      ErrorHandlerService.handleError(error, activate ? 'brandSaveActivate' : 'brandSaveDraft');
    } finally { setSaving(null); }
  };
  const previewInApp = async () => {
    setSaving('draft');
    try {
      const { preview: derived } = await brandService.preview(draft.config);
      brandPreview.preview(draft.config, derived);
      messageService.success('Previewing this appearance in your current browser session. Return to Settings to save or stop previewing.');
      onOpenChange(false);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'brandPreviewCandidate');
    } finally { setSaving(null); }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{existingDraft ? 'Edit appearance' : 'Set up appearance'}</DialogTitle>
          <DialogDescription>Step {stepIndex + 1} of {steps.length} — {current.description}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[520px]"><div className="pr-4"><Step draft={draft} templates={templates} change={(updates) => setDraft((value) => ({ ...value, ...updates }))} busy={busy} /></div></ScrollArea>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-4">
          <Button variant="outline" onClick={() => stepIndex === 0 ? onOpenChange(false) : setStepIndex((value) => value - 1)} disabled={busy}>{stepIndex === 0 ? 'Cancel' : 'Back'}</Button>
          {stepIndex === steps.length - 1 ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void previewInApp()} disabled={!valid || busy}>Preview in app</Button>
              <Button variant="secondary" onClick={() => void save(false)} disabled={!valid || busy}>{saving === 'draft' ? 'Saving…' : 'Save draft'}</Button>
              <Button onClick={() => void save(true)} disabled={!valid || busy}>{saving === 'activate' ? 'Activating…' : 'Save & activate'}</Button>
            </div>
          ) : <Button onClick={() => valid ? setStepIndex((value) => value + 1) : messageService.error('Finish the required fields on this step before continuing.')} disabled={!valid || busy}>Next</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
