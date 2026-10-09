// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowLeftRight, GripVertical, Loader2 } from "@/components/ui/icons";
// Page Setup label decorations — non-interactive (Rule 1) so we bypass the
// ui/icons wrapper (which adds whileHover) and use plain lucide-react.
import { Columns2, Files, Printer } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { GripIcon } from '@/components/animate-ui/icons/grip';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SectionHeader } from '@/components/shared/section-header';
import {
  Tabs as AnimatedTabs,
  TabsContent as AnimatedTabsContent,
  TabsContents as AnimatedTabsContents,
  TabsList as AnimatedTabsList,
  TabsTrigger as AnimatedTabsTrigger,
} from '@/components/ui/tabs';
import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { BetweenHorizontalStartIcon } from '@/components/animate-ui/icons/between-horizontal-start';
import { UndoIcon } from '@/components/animate-ui/icons/undo';
import { CopyIcon } from '@/components/animate-ui/icons/copy';
import { Trash2Icon } from '@/components/animate-ui/icons/trash-2';
import { ChevronDownIcon } from '@/components/animate-ui/icons/chevron-down';
import { ChevronUpIcon } from '@/components/animate-ui/icons/chevron-up';
import { ClipboardCheckIcon } from '@/components/animate-ui/icons/clipboard-check';
import { GalleryVerticalEndIcon } from '@/components/animate-ui/icons/gallery-vertical-end';
import { LayoutDashboardIcon } from '@/components/animate-ui/icons/layout-dashboard';
import { SquareArrowOutUpRightIcon } from '@/components/animate-ui/icons/square-arrow-out-up-right';
import { BridgedAnimatedIcon } from '@/components/animate-ui/bridge';
import { BoxIcon } from '@/components/ui/box';
import { LayoutPanelTopIcon } from '@/components/ui/layout-panel-top';
import { ReceiptTextIcon } from '@/components/ui/receipt-text';
// Action-bar & palette animated icons
import { DownloadIcon } from '@/components/animate-ui/icons/download';
import { SaveIcon } from '@/components/animate-ui/icons/save';
import { LanguagesIcon } from '@/components/animate-ui/icons/languages';
import { RotateCcwIcon } from '@/components/animate-ui/icons/rotate-ccw';
import { LayoutTemplateIcon } from '@/components/animate-ui/icons/layout-template';
import { MoreHorizontalIcon } from '@/components/animate-ui/icons/more-horizontal';
import { PencilIcon } from '@/components/animate-ui/icons/pencil';
import { SquarePenIcon } from '@/components/animate-ui/icons/square-pen';
import { TypeIcon } from '@/components/animate-ui/icons/type';
import { Table2Icon } from '@/components/animate-ui/icons/table-2';
import { RectangleEllipsisIcon } from '@/components/animate-ui/icons/rectangle-ellipsis';
import { MinusIcon } from '@/components/animate-ui/icons/minus';
import { PlusIcon } from '@/components/animate-ui/icons/plus';
import { SettingsIcon } from '@/components/animate-ui/icons/settings';
import { CirclePlusIcon } from '@/components/animate-ui/icons/circle-plus';
import { PackageXIcon } from '@/components/animate-ui/icons/package-x';
import { TagIcon } from '@/components/animate-ui/icons/tag';
import { AlertTriangleIcon } from '@/components/animate-ui/icons/alert-triangle';
import { ArrowLeftRightIcon } from '@/components/animate-ui/icons/arrow-left-right';
import { Grid2x2CheckIcon } from '@/components/animate-ui/icons/grid-2x2-check';
import { SquareDashedMousePointerIcon } from '@/components/animate-ui/icons/square-dashed-mouse-pointer';
import { Grid3x3Icon } from '@/components/animate-ui/icons/grid-3x3';
import { CalendarDaysIcon } from '@/components/animate-ui/icons/calendar-days';
import { EditDialog as FoodItemEditDialog } from '@/components/food-item-management/edit-dialog';
import { AddFoodItemDialog } from '@/components/food-item-management/add-dialog';
import { EditDialog as CategoryEditDialog } from '@/components/category-management/edit-dialog';
import { useCategoryContext } from '@/contexts/CategoryContext';
import { useFoodItemContext } from '@/contexts/FoodItemContext';
import { useTerminology } from '@/contexts/TerminologyContext';
import { Category } from '@/types/category';
import { DietaryFlags, FoodItem, FoodItemSupply, StatusFlags } from '@/types/food-item';
import { useMessage } from '@/hooks/message/useMessage';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { notifyFoodItemCreateError } from '@/services/food-item/duplicate-name-notification';
import { shoppingListBuilderService } from '@/services/shopping-list-builder';
import { GlobalLimitService } from '@/services/global-limit';
import { DEFAULT_ICON, getIconComponent } from '@/lib/food-icons';
import { cn, truncateMiddle } from '@/lib/utils';
import { createBuilderComponent, createDefaultBuilderTemplate } from './default-template';
import {
  BUILDER_CELL_VERTICAL_PADDING_PT,
  BUILDER_FONT_SIZES,
  BUILDER_LINE_HEIGHT_MULTIPLIER,
  BUILDER_TAGGED_HEADER_LINE_HEIGHT_MULTIPLIER,
  SPLIT_PAGE_FONT_SIZES,
  SPLIT_PAGE_MAX_BUILDER_FONT_SIZE,
  baseRowHeight as typographyBaseRowHeight,
  estimateWrappedLineCount as typographyEstimateLineCount,
  snapHeightToGridForFontSize as typographySnapHeightForFontSize,
  taggedHeaderHeight as typographyTaggedHeaderHeight,
  untaggedHeaderHeight as typographyUntaggedHeaderHeight,
} from './typography';
import {
  BUILDER_COMPONENT_REGIONS,
  BUILDER_DATE_FORMATS,
  BUILDER_HEADER_FOOTER_REPEAT_MODES,
  BODY_SPLIT_GUIDE_COLOR,
  BuilderComponent,
  BuilderBodyLane,
  BuilderBodyLayoutMode,
  BuilderComponentRegion,
  BuilderComponentType,
  BuilderDateFormatId,
  BuilderLanguageTagMode,
  BuilderHeaderFooterRepeatMode,
  BuilderLayoutMode,
  BuilderPrintMode,
  DateBuilderComponent,
  DEFAULT_DATE_FORMAT_ID,
  DEFAULT_LANGUAGE_TAG_MODE,
  formatBuilderDate,
  parseBuilderCustomDate,
  resolveBuilderDateInstance,
  shouldRenderHeaderFooterOnPage,
  toBuilderCustomDateIso,
  DEFAULT_BUILDER_COMPONENT_WIDTH,
  DEFAULT_FORM_FIELD_GROUP_HEIGHT,
  DEFAULT_FORM_FIELD_ROW_HEIGHT,
  DEFAULT_GRID_SIZE,
  DEFAULT_SECTION_TABLE_ROW_HEIGHT,
  SECTION_TABLE_HEADER_TIGHT_LINE_HEIGHT,
  DEFAULT_COMPONENT_REGION,
  FormFieldGroupBuilderComponent,
  getTemplateBodyColumnGap,
  getTemplateBodyLaneBounds,
  getTemplateBodyLayoutMode,
  getTemplateFooterHeight,
  getTemplateGridSize,
  getTemplateHeaderHeight,
  getTemplateLayoutMode,
  getTemplateMaxPages,
  getTemplateIncludeCategoryIcons,
  getTemplatePrintMode,
  getTemplateRegionBounds,
  getCenteredXInBodyHalf,
  HEADER_FOOTER_LINE_COLOR,
  HEADER_FOOTER_MIN_BODY,
  InventorySectionComponent,
  LanguageTagBuilderComponent,
  LegendBuilderComponent,
  LineBuilderComponent,
  SavedBuilderComponent,
  SavedBuilderTemplate,
  BuilderTranslationMode,
  DEFAULT_BUILDER_TRANSLATION_MODE,
  normalizeLegacyBuilderTemplateGeometry,
  normalizeSectionTableTranslationHeightAdjustment,
  SectionTableBuilderComponent,
  SectionTableTranslationSettings,
  SectionTableRow,
  ShoppingListBuilderTemplate,
  resolveSectionTableTranslationSettings,
  resolveBuilderLanguageTagText,
  snapToGrid,
  TextBuilderComponent,
} from './types';
import { TranslationSettingsDialog } from './dialogs/translation-settings-dialog';
import { SectionTableTranslationSettingsDialog } from './dialogs/section-table-translation-settings-dialog';
import {
  BUILDER_TEXT_ORIGINAL_TAG_MEASURE_FONT_SIZE,
  BUILDER_TEXT_ORIGINAL_TAG_FONT_SIZE,
  PreviewLanguageContext,
  isRTLLanguage,
  renderTextBody,
  renderTranslatedBuilderText,
  usePreviewLanguage,
} from './translation-render';
import {
  mergePreviewTranslations,
  resolvePreviewTranslationPreflight,
} from './preview-language';
// Pulled by PageSetupPanel for the canvas-wide "Preview language" select
// and consumed by the TranslationSettingsDialog. ShoppingListBuilder.tsx
// is wrapped in <LanguageProvider> (see App.tsx); this is the only place
// the builder file itself needs the hook.
import { useLanguageContext } from '@/contexts/LanguageContext';

const BUILDER_COMPONENT_DRAG_TYPE = 'application/x-shopping-list-builder-component';
const SAVED_COMPONENT_DRAG_TYPE = 'application/x-shopping-list-builder-saved-component-id';
const INVENTORY_SECTION_DRAG_TYPE = 'application/x-shopping-list-builder-inventory-category-id';
const DRAG_TEXT_FALLBACK_TYPE = 'text/plain';

const paletteItems: Array<{
  type: BuilderComponentType;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { type: 'text', label: 'Text block', icon: TypeIcon },
  { type: 'date', label: 'Date', icon: CalendarDaysIcon },
  { type: 'language-tag', label: 'Language tag', icon: LanguagesIcon },
  { type: 'form-field-group', label: 'Form fields', icon: RectangleEllipsisIcon },
  { type: 'section-table', label: 'Section table', icon: Table2Icon },
  { type: 'line', label: 'Line', icon: MinusIcon },
  { type: 'legend', label: 'Legend', icon: GalleryVerticalEndIcon },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const toNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const BUILDER_LIST_SCROLL_CLASS = 'h-[172px] pr-3';
const MAX_SAVED_TEMPLATE_NAME_LENGTH = 48;
const GUIDED_COLLISION_GAP = 4;
// Flow stacking gap. One grid square gives stacked flowing tables a clean
// visual breathing margin that matches the canvas grid rhythm.
const FLOWING_TABLE_GAP = 9;
const DROPDOWN_TO_DIALOG_OPEN_DELAY_MS = 250;
// Flowing table preview is planner-backed: the canvas renders the same page and
// lane segments that the Chromium PDF export renders.
const ENABLE_FLOWING_TABLE_PREVIEW = true;
const TABLE_CELL_HORIZONTAL_PADDING = 8;
const AVERAGE_TABLE_CHARACTER_WIDTH_RATIO = 0.52;
// Canvas zoom slider. The slider's 100% maps to a 1.2x render scale because
// at 1.2x a Letter page fills the default Properties-card-flanked canvas
// region; that anchor is the user-facing "Full page" preset. Slider values
// are stored as displayed percentages; getCanvasScale() converts them to the
// transform: scale() multiplier used by the page frame.
const CANVAS_ZOOM_SCALE_FACTOR = 1.2;
const CANVAS_MIN_ZOOM = 70;
const CANVAS_MAX_ZOOM = 200;
const CANVAS_DEFAULT_ZOOM = 100;
const CANVAS_ZOOM_STEP = 5;
const getCanvasScale = (zoom: number) => (zoom * CANVAS_ZOOM_SCALE_FACTOR) / 100;

type BuilderLabelAnimateIcon = React.ComponentType<{
  className?: string;
  size?: number;
}>;

type BuilderLabelBridgedIcon = React.ForwardRefExoticComponent<
  // The lucide-animated registry files expose icon-specific handle types, but
  // every handle follows this same imperative animation contract.
  React.RefAttributes<{ startAnimation: () => void; stopAnimation: () => void }> &
    Record<string, unknown>
>;

type BuilderLabelIconConfig =
  | { type: 'animate'; icon: BuilderLabelAnimateIcon }
  | { type: 'bridged'; icon: BuilderLabelBridgedIcon };

function BuilderLabelIcon({ config }: { config: BuilderLabelIconConfig }) {
  if (config.type === 'animate') {
    const Icon = config.icon;
    return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" size={16} />;
  }

  return (
    <BridgedAnimatedIcon
      icon={config.icon}
      className="h-4 w-4 shrink-0 text-muted-foreground"
      size={16}
    />
  );
}

function BuilderSectionLabel({
  children,
  className,
  htmlFor,
  icon,
}: {
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
  icon: BuilderLabelIconConfig;
}) {
  // Section labels are non-interactive (Rule 1). The icon renders static
  // here even though the underlying components (BuilderLabelIcon and the
  // bridged imperative-ref icons) can animate, because we do not wrap in
  // <AnimateIcon> and do not provide an AnimateIconContext. Imperative-ref
  // icons rendered via BridgedAnimatedIcon read from context only — without
  // one, they stay static even though their own div has hover handlers.
  const content = (
    <span className="flex items-center gap-2">
      <BuilderLabelIcon config={icon} />
      <span>{children}</span>
    </span>
  );

  if (htmlFor) {
    return (
      <Label htmlFor={htmlFor} className={cn('flex items-center gap-2', className)}>
        {content}
      </Label>
    );
  }

  return <div className={cn('flex items-center gap-2', className)}>{content}</div>;
}

function ShoppingListBuilderTitleIcon({
  className,
  size,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <AnimateIcon animateOnView animateOnViewOnce animateOnHover>
      <LayoutDashboardIcon className={className} size={size} />
    </AnimateIcon>
  );
}

interface BuilderTextMeasureSegment {
  text: string;
  fontSize: number;
  fontWeight?: 'normal' | 'bold';
  // When true the segment's whole `text` is measured as one unbreakable
  // token -- internal whitespace is NOT a wrap opportunity. Used by the
  // `translate-with-original-adaptive` mode so the 8pt English tag either
  // fits on the current line or drops whole onto the next one.
  atomic?: boolean;
}

interface SectionTableMeasurementOptions {
  language?: string;
  translations?: Record<string, string>;
  inventoryTranslations?: {
    categories: Record<number, string>;
    foodItems: Record<number, string>;
  };
}

const limitTemplateName = (name: string) => name.slice(0, MAX_SAVED_TEMPLATE_NAME_LENGTH);
const normalizeSavedEntityName = (name: string) => name.trim().toLocaleLowerCase();

interface EditingSavedComponentSource {
  savedComponentId: number;
  canvasComponentId: string;
}

const setBuilderDragData = (
  event: React.DragEvent<HTMLElement>,
  type: string,
  value: string,
  label: string,
) => {
  const payload = JSON.stringify({ type, value });
  event.dataTransfer.clearData();
  event.dataTransfer.setData(type, value);
  event.dataTransfer.setData(DRAG_TEXT_FALLBACK_TYPE, payload);
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.dropEffect = 'copy';
  event.currentTarget.setAttribute('data-dragging-label', label);
};

const getBuilderDragData = (event: React.DragEvent<HTMLDivElement>, type: string) => {
  const directValue = event.dataTransfer.getData(type);
  if (directValue) {
    return directValue;
  }

  try {
    const fallback = JSON.parse(event.dataTransfer.getData(DRAG_TEXT_FALLBACK_TYPE)) as {
      type?: string;
      value?: string;
    };
    return fallback.type === type ? fallback.value ?? '' : '';
  } catch {
    return '';
  }
};

const isCjkCharacter = (character: string) => /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/u.test(character);
const isFullWidthCharacter = (character: string) => /[\uFF01-\uFF60\uFFE0-\uFFE6]/u.test(character);
const isCyrillicCharacter = (character: string) => /[\u0400-\u04FF]/u.test(character);

const estimateGlyphWidth = (character: string, fontSize: number) => {
  if (isCjkCharacter(character) || isFullWidthCharacter(character)) {
    return fontSize;
  }
  if (/\s/u.test(character)) {
    return fontSize * 0.28;
  }
  if (isCyrillicCharacter(character)) {
    return fontSize * 0.58;
  }
  if (/[ilI.,'`:;]/u.test(character)) {
    return fontSize * 0.3;
  }
  if (/[mwMW@%&]/u.test(character)) {
    return fontSize * 0.78;
  }
  if (/[A-Z0-9]/u.test(character)) {
    return fontSize * 0.56;
  }
  return fontSize * AVERAGE_TABLE_CHARACTER_WIDTH_RATIO;
};

const estimateVisualTextWidth = (
  value: string,
  fontSize: number,
  fontWeight: BuilderTextMeasureSegment['fontWeight'] = 'normal',
) => {
  const weightMultiplier = fontWeight === 'bold' ? 1.08 : 1;
  return (
    Array.from(String(value || '')).reduce((total, character) => (
      total + estimateGlyphWidth(character, fontSize)
    ), 0) * weightMultiplier
  );
};

const estimateWrappedLineCount = (value: string, availableWidth: number, fontSize: number) => {
  return estimateWrappedSegmentLineCount([{ text: value, fontSize }], availableWidth);
};

// Slack (in pt) subtracted from the cell's available width before
// comparing predicted token widths. Compensates for per-glyph estimator
// variance between headless puppeteer (which the per-character ratios
// were calibrated against) and shipping Chromium on macOS, where Latin
// text routinely renders 3-5% wider than the estimator predicts. Mirror
// with `WRAP_AVAILABLE_WIDTH_SAFETY_PT` in the backend route.
const WRAP_AVAILABLE_WIDTH_SAFETY_PT = 6;

// Real Chromium renders text ~3-5% wider than the per-glyph estimator
// predicts, so the wrap slack must scale with the cell width rather than be a
// flat pt value (ISSUES.md #33). A flat 6pt under-cushioned mid-width cells
// even at 12pt (e.g. "Hot Dog & Hamburger Buns" wrapped in real Chrome but the
// planner predicted one line, so the row never grew). Reserve the larger of
// the 6pt floor and 5% of the available width. Mirror with the backend route engine.
const WRAP_AVAILABLE_WIDTH_SAFETY_RATIO = 0.05;

const estimateWrappedSegmentLineCount = (
  segments: BuilderTextMeasureSegment[],
  availableWidth: number,
) => {
  // Conservative effective width: reserve a small slack to absorb the
  // per-glyph metric variance between the planner's estimator and real
  // Chrome rendering. Without it, borderline rows like Swahili "Vitu
  // mbalimbali vilivyohifadhiwa kwa baridi" measured 147.8pt against a
  // 148pt cell (planner: fits one line) but Chrome wrapped the
  // translation, overflowing the row's planned height.
  const safetyPt = Math.max(
    WRAP_AVAILABLE_WIDTH_SAFETY_PT,
    availableWidth * WRAP_AVAILABLE_WIDTH_SAFETY_RATIO,
  );
  const width = Math.max(1, availableWidth - safetyPt);
  let lineCount = 1;
  let currentLineWidth = 0;
  let pendingSpaceWidth = 0;
  let hasContentOnLine = false;

  const resetLine = () => {
    lineCount += 1;
    currentLineWidth = 0;
    pendingSpaceWidth = 0;
    hasContentOnLine = false;
  };

  segments.forEach((segment) => {
    const fontSize = Math.max(1, segment.fontSize);
    // Atomic segments are measured as a single token (internal whitespace is
    // not a wrap opportunity); non-atomic segments split on newlines/spaces.
    const tokens = segment.atomic
      ? [String(segment.text || '')]
      : String(segment.text || '').split(/(\n|\s+)/);
    tokens.forEach((token) => {
      if (!token) return;
      if (token === '\n') {
        resetLine();
        return;
      }
      if (/^\s+$/.test(token)) {
        if (hasContentOnLine) {
          pendingSpaceWidth += estimateVisualTextWidth(token, fontSize, segment.fontWeight);
        }
        return;
      }

      const tokenWidth = estimateVisualTextWidth(token, fontSize, segment.fontWeight);
      const candidateWidth = hasContentOnLine
        ? currentLineWidth + pendingSpaceWidth + tokenWidth
        : tokenWidth;

      if (hasContentOnLine && candidateWidth > width) {
        lineCount += 1;
        currentLineWidth = 0;
        hasContentOnLine = false;
      }

      if (tokenWidth > width) {
        const tokenLineCount = Math.max(1, Math.ceil(tokenWidth / width));
        lineCount += tokenLineCount - 1;
        currentLineWidth = tokenWidth - ((tokenLineCount - 1) * width);
        if (currentLineWidth <= 0 || currentLineWidth > width) {
          currentLineWidth = width;
        }
      } else {
        currentLineWidth = hasContentOnLine ? candidateWidth : tokenWidth;
      }
      pendingSpaceWidth = 0;
      hasContentOnLine = true;
    });
  });

  return lineCount;
};

const translationMeasureSegments = (
  original: string,
  cachedTranslation: string | null | undefined,
  mode: BuilderTranslationMode,
  fontSize: number,
): BuilderTextMeasureSegment[] => {
  if (mode === 'skip' || !cachedTranslation) {
    return [{ text: original, fontSize }];
  }
  if (
    mode === 'translate-with-original'
    || mode === 'translate-with-original-block'
    || mode === 'translate-with-original-adaptive'
  ) {
    // `-block` forces the English tag onto its own line: a '\n' segment
    // is read as a hard break by estimateWrappedSegmentLineCount, so the
    // measured row height accounts for the extra line. The plain inline
    // variant uses a space and lets the tag wrap word-by-word. `-adaptive`
    // also uses a space separator but marks the English segment `atomic`,
    // so the measurement keeps the tag whole -- it either fits on the
    // current line or counts as one extra line, matching the
    // `white-space: nowrap` render.
    const block = mode === 'translate-with-original-block';
    const adaptive = mode === 'translate-with-original-adaptive';
    const separator = block ? '\n' : ' ';
    return [
      { text: cachedTranslation, fontSize },
      { text: separator, fontSize },
      {
        text: original,
        fontSize: BUILDER_TEXT_ORIGINAL_TAG_MEASURE_FONT_SIZE,
        fontWeight: 'bold',
        atomic: adaptive,
      },
    ];
  }
  return [{ text: cachedTranslation, fontSize }];
};

const sectionTableTitleSegments = (
  component: SectionTableBuilderComponent,
  fontSize: number,
  measurement?: SectionTableMeasurementOptions,
) => {
  const headerMode = resolveSectionTableTranslationSettings(component.translationSettings).headers;
  // Inventory tables resolve the title from CategoryTranslation; base-
  // component tables resolve it from the Generated (List) cache.
  const categoryTranslation = component.inventorySource?.categoryId
    ? measurement?.inventoryTranslations?.categories[component.inventorySource.categoryId]
    : measurement?.translations?.[component.title];

  return translationMeasureSegments(component.title, categoryTranslation, headerMode, fontSize);
};

const sectionTableRowItemSegments = (
  row: SectionTableBuilderComponent['rows'][number],
  mode: BuilderTranslationMode,
  fontSize: number,
  measurement?: SectionTableMeasurementOptions,
) => {
  // Inventory rows resolve from FoodItemTranslation; base-component rows
  // (no foodItemId) resolve from the Generated (List) cache.
  const itemTranslation = row.foodItemId
    ? measurement?.inventoryTranslations?.foodItems[row.foodItemId]
    : measurement?.translations?.[row.item];

  return translationMeasureSegments(row.item, itemTranslation, mode, fontSize);
};

const builderGeneratedTextSegments = (
  original: string,
  mode: BuilderTranslationMode,
  fontSize: number,
  measurement?: SectionTableMeasurementOptions,
) => translationMeasureSegments(original, measurement?.translations?.[original], mode, fontSize);

const sectionTableRowUsesTranslatedText = (
  row: SectionTableBuilderComponent['rows'][number],
  mode: BuilderTranslationMode,
  measurement?: SectionTableMeasurementOptions,
) => {
  if (mode === 'skip') return false;
  // Inventory rows: look in FoodItemTranslation. Base-component rows
  // (no foodItemId): look in the Generated (List) cache.
  return row.foodItemId
    ? Boolean(measurement?.inventoryTranslations?.foodItems[row.foodItemId])
    : Boolean(measurement?.translations?.[row.item]);
};

const builderGeneratedTextUsesTranslation = (
  original: string,
  mode: BuilderTranslationMode,
  measurement?: SectionTableMeasurementOptions,
) => (
  mode !== 'skip'
  && Boolean(measurement?.translations?.[original])
);

const sectionTableHeaderMeasurementSegments = (
  component: SectionTableBuilderComponent,
  fontSize: number,
  measurement?: SectionTableMeasurementOptions,
) => {
  const settings = resolveSectionTableTranslationSettings(component.translationSettings);
  const categoryLimitTag = formatCategoryLimitTag(component.categoryLimit, component.categoryLimitType);
  return {
    titleSegments: sectionTableTitleSegments(component, fontSize, measurement),
    categoryLimitSegments: categoryLimitTag
      ? builderGeneratedTextSegments(`(${categoryLimitTag})`, settings.tags, Math.max(7, fontSize - 2), measurement)
      : undefined,
    limitHeaderSegments: component.showLimit
      ? builderGeneratedTextSegments(component.limitHeader || 'Limit', settings.headers, fontSize, measurement)
      : undefined,
    wantHeaderSegments: builderGeneratedTextSegments(component.wantHeader || 'Want', settings.headers, fontSize, measurement),
  };
};

const getSectionTableTranslationHeightAdjustmentPt = (
  component: SectionTableBuilderComponent,
  measurement?: SectionTableMeasurementOptions,
) => {
  if (!measurement?.language) return 0;
  const gridSquares = normalizeSectionTableTranslationHeightAdjustment(
    component.translationHeightAdjustments?.[measurement.language],
  );
  return gridSquares * DEFAULT_GRID_SIZE;
};

const getAdjustedSectionTablePlannerHeight = (
  component: SectionTableBuilderComponent,
  visualHeight: number,
  measurement?: SectionTableMeasurementOptions,
) => {
  // Manual translation-height adjustments reserve planner space only; row
  // heights stay visual so the painted table does not change.
  const adjustment = getSectionTableTranslationHeightAdjustmentPt(component, measurement);
  if (adjustment === 0) return visualHeight;
  return Math.max(DEFAULT_GRID_SIZE, visualHeight + adjustment);
};

// A2: pt reserved at the start of the item cell by status icons (Limited /
// Clearance), so the item text wraps in the remaining width. ~1em icon + gap
// per visible icon; mirrors the backend `statusIconRowOverhead`.
const statusIconRowOverhead = (
  row: SectionTableBuilderComponent['rows'][number],
  fontSize: number,
  showStatusIcons?: boolean,
): number => {
  if (!showStatusIcons) return 0;
  const count = (row.isLimited ? 1 : 0) + (row.isClearance ? 1 : 0);
  return count * fontSize * 1.35;
};

const getTableRowTextLineCount = (
  row: SectionTableBuilderComponent['rows'][number],
  options: {
    itemWidth: number;
    limitWidth: number;
    fontSize: number;
    showLimit: boolean;
    showStatusIcons?: boolean;
    itemSegments?: BuilderTextMeasureSegment[];
  },
) => Math.max(
  options.itemSegments
    ? estimateWrappedSegmentLineCount(
      options.itemSegments,
      Math.max(1, options.itemWidth - TABLE_CELL_HORIZONTAL_PADDING - statusIconRowOverhead(row, options.fontSize, options.showStatusIcons)),
    )
    : estimateWrappedLineCount(
      row.item,
      Math.max(1, options.itemWidth - TABLE_CELL_HORIZONTAL_PADDING - statusIconRowOverhead(row, options.fontSize, options.showStatusIcons)),
      options.fontSize,
    ),
  options.showLimit
    ? estimateWrappedLineCount(
      row.limit,
      Math.max(1, options.limitWidth - TABLE_CELL_HORIZONTAL_PADDING),
      options.fontSize,
    )
    : 1,
);

const getTableRowHeight = (
  row: SectionTableBuilderComponent['rows'][number],
  rowHeight: number,
  options: {
    itemWidth: number;
    limitWidth: number;
    fontSize: number;
    showLimit: boolean;
    showStatusIcons?: boolean;
    itemSegments?: BuilderTextMeasureSegment[];
    useNaturalContentHeight?: boolean;
  },
) => {
  // Font-aware floor from the typography engine. At fontSize=10 this is 15pt,
  // matching the shared 3pt geometry grid; larger fonts grow to the next
  // typography band.
  const fontFloor = typographyBaseRowHeight(options.fontSize);
  const storedRowHeight = Number.isFinite(rowHeight) && rowHeight > 0
    ? rowHeight
    : DEFAULT_SECTION_TABLE_ROW_HEIGHT;
  const baseRowHeight = Math.max(storedRowHeight, fontFloor);
  const lineCount = getTableRowTextLineCount(row, options);

  if (options.useNaturalContentHeight) {
    return Math.max(
      baseRowHeight,
      typographySnapHeightForFontSize(options.fontSize, lineCount),
    );
  }

  return Math.max(baseRowHeight, baseRowHeight * lineCount);
};

// Mirrors `categoryIconTitleWidthOverhead` in
// `packages/backend/src/routes/shopping-list-builder.ts`. The renderer puts
// a `width: 1em` icon in the title cell with a `gap: 2ch` flex gap when
// `includeCategoryIcons === true` and the table has an `inventorySource`.
// Pure geometric overhead is ~`1em + 2ch ≈ fontSize × 2.12`, but real
// macOS Chrome renders Latin titles measurably wider than puppeteer (the
// font metrics the per-glyph table was calibrated against), so the planner
// reserves `fontSize × 3.5` to keep Swahili "Vyakula Vilivyogandishwa" +
// (Chagua hadi 3) from clipping the bottom of the header band.
const categoryIconTitleWidthOverhead = (fontSize: number, showCategoryIcon: boolean): number =>
  showCategoryIcon ? Math.ceil(fontSize * 3.5) : 0;

const getTableHeaderHeight = (
  component: SectionTableBuilderComponent,
  rowHeight: number,
  options: {
    itemWidth: number;
    limitWidth: number;
    wantWidth: number;
    fontSize: number;
    showLimit: boolean;
    showWant: boolean;
    titleSegments?: BuilderTextMeasureSegment[];
    categoryLimitSegments?: BuilderTextMeasureSegment[];
    limitHeaderSegments?: BuilderTextMeasureSegment[];
    wantHeaderSegments?: BuilderTextMeasureSegment[];
    iconOverhead?: number;
  },
) => {
  const categoryLimitTag = formatCategoryLimitTag(component.categoryLimit, component.categoryLimitType);
  // Only the title shares its cell with the category icon; tag, limit, and
  // want headers render in their own cells and are unaffected by iconOverhead.
  const titleAvailableWidth = Math.max(
    1,
    options.itemWidth - TABLE_CELL_HORIZONTAL_PADDING - (options.iconOverhead ?? 0),
  );
  const titleLineCount = options.titleSegments
    ? estimateWrappedSegmentLineCount(options.titleSegments, titleAvailableWidth)
    : estimateWrappedLineCount(component.title, titleAvailableWidth, options.fontSize);
  const categoryLimitLineCount = categoryLimitTag
    ? (options.categoryLimitSegments
      ? estimateWrappedSegmentLineCount(
        options.categoryLimitSegments,
        Math.max(1, options.itemWidth - TABLE_CELL_HORIZONTAL_PADDING),
      )
      : estimateWrappedLineCount(
        `(${categoryLimitTag})`,
        Math.max(1, options.itemWidth - TABLE_CELL_HORIZONTAL_PADDING),
        Math.max(7, options.fontSize - 2),
      ))
    : 0;
  const limitHeaderLineCount = options.showLimit
    ? (options.limitHeaderSegments
      ? estimateWrappedSegmentLineCount(
        options.limitHeaderSegments,
        Math.max(1, options.limitWidth - TABLE_CELL_HORIZONTAL_PADDING),
      )
      : estimateWrappedLineCount(
        component.limitHeader || 'Limit',
        Math.max(1, options.limitWidth - TABLE_CELL_HORIZONTAL_PADDING),
        options.fontSize,
      ))
    : 1;
  const wantHeaderLineCount = options.showWant
    ? (options.wantHeaderSegments
      ? estimateWrappedSegmentLineCount(
        options.wantHeaderSegments,
        Math.max(1, options.wantWidth - TABLE_CELL_HORIZONTAL_PADDING),
      )
      : estimateWrappedLineCount(
        component.wantHeader || 'Want',
        Math.max(1, options.wantWidth - TABLE_CELL_HORIZONTAL_PADDING),
        options.fontSize,
      ))
    : 1;
  const otherHeaderMaxLineCount = Math.max(1, limitHeaderLineCount, wantHeaderLineCount);

  // Tagged case: typography engine snaps the compact title/tag stack to the
  // shared 3pt geometry grid, with a 27pt minimum band.
  if (categoryLimitTag) {
    return typographyTaggedHeaderHeight(
      options.fontSize,
      titleLineCount,
      categoryLimitLineCount,
      otherHeaderMaxLineCount,
    );
  }

  // Untagged case: max(title, limitHeader, wantHeader) lines ×
  // baseRowHeight(fontSize). Honor any caller-supplied rowHeight that already
  // exceeds the font floor.
  const maxLineCount = Math.max(titleLineCount, otherHeaderMaxLineCount);
  const typographyHeight = typographyUntaggedHeaderHeight(options.fontSize, maxLineCount);
  if (Number.isFinite(rowHeight) && rowHeight > 0) {
    return Math.max(typographyHeight, rowHeight * maxLineCount);
  }
  return typographyHeight;
};

const getComponentHeight = (
  component: BuilderComponent,
  measurement?: SectionTableMeasurementOptions,
  layout?: { includeCategoryIcons?: boolean },
) => {
  if (component.type === 'section-table') {
    const rowHeight = Number.isFinite(component.rowHeight) && component.rowHeight > 0
      ? component.rowHeight
      : DEFAULT_SECTION_TABLE_ROW_HEIGHT;
    const limitWidth = component.showLimit ? component.limitWidth : 0;
    const showWant = component.showWant !== false;
    const wantWidth = showWant ? component.wantWidth : 0;
    const itemWidth = component.width - limitWidth - wantWidth;
    const rowMode = resolveSectionTableTranslationSettings(component.translationSettings).rows;
    const showCategoryIcon = Boolean(layout?.includeCategoryIcons && component.inventorySource);
    const headerHeight = getTableHeaderHeight(component, rowHeight, {
      itemWidth,
      limitWidth,
      wantWidth,
      fontSize: component.fontSize,
      showLimit: component.showLimit,
      showWant,
      iconOverhead: categoryIconTitleWidthOverhead(component.fontSize, showCategoryIcon),
      ...sectionTableHeaderMeasurementSegments(component, component.fontSize, measurement),
    });

    const rowHeights = component.rows.map((row) => getTableRowHeight(row, rowHeight, {
      itemWidth,
      limitWidth,
      fontSize: component.fontSize,
      showLimit: component.showLimit,
      showStatusIcons: component.showStatusIcons === true,
      itemSegments: sectionTableRowItemSegments(row, rowMode, component.fontSize, measurement),
      useNaturalContentHeight: sectionTableRowUsesTranslatedText(row, rowMode, measurement),
    }));
    const visualHeight = headerHeight + rowHeights.reduce((total, height) => total + height, 0);
    return getAdjustedSectionTablePlannerHeight(component, visualHeight, measurement);
  }

  if (component.type === 'form-field-group') {
    // Font-aware per-row height + label wrap. At fontSize=10 with single-line
    // labels this is 18pt × N (= legacy DEFAULT_FORM_FIELD_ROW_HEIGHT × N, no
    // change for existing forms). When a label wraps (long text in a narrow
    // labelWidth, or a larger font) each affected row grows to perRow × lineCount,
    // matching what the canvas / PDF actually render.
    const perRow = typographyBaseRowHeight(component.fontSize);
    const labelWidth = Math.min(component.labelWidth, component.width - 24);
    // Label cell renders with px-[3px] horizontal padding (6px total).
    const labelAvailableWidth = Math.max(1, labelWidth - 6);
    const fieldsHeight = component.fields.reduce((total, field) => {
      const mode = field.translationMode ?? DEFAULT_BUILDER_TRANSLATION_MODE;
      const lineCount = builderGeneratedTextUsesTranslation(field.label, mode, measurement)
        ? estimateWrappedSegmentLineCount(
          builderGeneratedTextSegments(field.label, mode, component.fontSize, measurement),
          labelAvailableWidth,
        )
        : typographyEstimateLineCount(field.label, labelAvailableWidth, component.fontSize);
      return total + Math.max(perRow, perRow * lineCount);
    }, 0);
    return Math.max(
      component.height,
      DEFAULT_FORM_FIELD_GROUP_HEIGHT,
      fieldsHeight,
    );
  }

  if (component.type === 'line') {
    return component.direction === 'horizontal'
      ? Math.max(component.strokeWidth, 4)
      : Math.max(component.height, 16);
  }

  if (component.type === 'legend') {
    const entries = (component.showLimited ? 1 : 0) + (component.showClearance ? 1 : 0);
    const rows = component.layout === 'vertical' ? Math.max(1, entries) : 1;
    return typographyBaseRowHeight(component.fontSize) * rows;
  }

  return component.height;
};

const getCanvasComponentHeight = (
  component: BuilderComponent,
  measurement?: SectionTableMeasurementOptions,
  layout?: { includeCategoryIcons?: boolean },
) => getComponentHeight(component, measurement, layout);

interface SectionTableMetrics {
  rowHeight: number;
  limitWidth: number;
  wantWidth: number;
  itemWidth: number;
  fontSize: number;
  headerHeight: number;
}

interface FlowingTableSegment {
  component: SectionTableBuilderComponent;
  pageIndex: number;
  lane: BuilderBodyLane;
  x: number;
  y: number;
  width: number;
  height: number;
  rows: SectionTableRow[];
  rowHeights: number[];
  startRowIndex: number;
  isFirstSegment: boolean;
  isContinuation: boolean;
}

interface BodyPlacement {
  componentId: string;
  pageIndex: number;
  lane: BuilderBodyLane;
  x: number;
  y: number;
  height: number;
}

interface FlowingTablePlan {
  pageCount: number;
  segments: FlowingTableSegment[];
  flowingComponentIds: Set<string>;
  // In Guided Mode the planner places ALL body components by sequence;
  // their derived positions live here. Empty in Freeform Mode (where
  // non-flowing body components keep their stored x/y).
  bodyPlacements: BodyPlacement[];
  // Body components fully governed by the plan (segments + placements).
  // Renderers and drag handlers use this to decide whether to honor stored
  // x/y or use plan-derived positions.
  plannedBodyComponentIds: Set<string>;
  overflowRowCount: number;
}

const getSectionTableMetrics = (
  component: SectionTableBuilderComponent,
  measurement?: SectionTableMeasurementOptions,
  // Whether the category icon will share the title cell at render time
  // (`template.includeCategoryIcons` AND `component.inventorySource`).
  // Threaded from `PreviewSectionTable` so the planner's title wrap
  // measurement matches what Chromium will actually lay out.
  layout?: { showCategoryIcon?: boolean },
): SectionTableMetrics => {
  const rowHeight = Number.isFinite(component.rowHeight) && component.rowHeight > 0
    ? component.rowHeight
    : DEFAULT_SECTION_TABLE_ROW_HEIGHT;
  const limitWidth = component.showLimit ? component.limitWidth : 0;
  const showWant = component.showWant !== false;
  const wantWidth = showWant ? component.wantWidth : 0;
  const itemWidth = component.width - limitWidth - wantWidth;
  const fontSize = component.fontSize;
  const showCategoryIcon = Boolean(layout?.showCategoryIcon && component.inventorySource);
  const headerHeight = getTableHeaderHeight(component, rowHeight, {
    itemWidth,
    limitWidth,
    wantWidth,
    fontSize,
    showLimit: component.showLimit,
    showWant,
    iconOverhead: categoryIconTitleWidthOverhead(fontSize, showCategoryIcon),
    ...sectionTableHeaderMeasurementSegments(component, fontSize, measurement),
  });

  return { rowHeight, limitWidth, wantWidth, itemWidth, fontSize, headerHeight };
};

const getSectionTableRowHeights = (
  component: SectionTableBuilderComponent,
  metrics = getSectionTableMetrics(component),
  measurement?: SectionTableMeasurementOptions,
) => {
  const rowMode = resolveSectionTableTranslationSettings(component.translationSettings).rows;
  const rowHeights = component.rows.map((row) => getTableRowHeight(row, metrics.rowHeight, {
    itemWidth: metrics.itemWidth,
    limitWidth: metrics.limitWidth,
    fontSize: metrics.fontSize,
    showLimit: component.showLimit,
    showStatusIcons: component.showStatusIcons === true,
    itemSegments: sectionTableRowItemSegments(row, rowMode, metrics.fontSize, measurement),
    useNaturalContentHeight: sectionTableRowUsesTranslatedText(row, rowMode, measurement),
  }));
  return rowHeights;
};

const isFlowingBodyTable = (component: BuilderComponent, template: ShoppingListBuilderTemplate): component is SectionTableBuilderComponent => (
  component.type === 'section-table'
  && getComponentRegion(component, template) === 'body'
  && ENABLE_FLOWING_TABLE_PREVIEW
  && component.flowMode === 'flowing'
);

const nextFlowLane = (
  pageIndex: number,
  lane: BuilderBodyLane,
  template: ShoppingListBuilderTemplate,
): { pageIndex: number; lane: BuilderBodyLane } => {
  if (getTemplateBodyLayoutMode(template) !== 'split') {
    return { pageIndex: pageIndex + 1, lane: 'full' };
  }

  if (lane === 'left') {
    return { pageIndex, lane: 'right' };
  }

  return { pageIndex: pageIndex + 1, lane: 'left' };
};

const getFlowSegmentX = (
  component: SectionTableBuilderComponent,
  template: ShoppingListBuilderTemplate,
  lane: BuilderBodyLane,
  isFirstSegment: boolean,
) => {
  if (getTemplateBodyLayoutMode(template) !== 'split' || lane === 'full') {
    return isFirstSegment ? component.x : clamp(component.x, 0, template.paper.width - component.width);
  }

  const center = template.paper.width / 2;
  const halfLeft = lane === 'right' ? center : 0;
  const halfRight = lane === 'right' ? template.paper.width : center;
  const usableWidth = Math.max(0, halfRight - halfLeft);
  if (component.width >= usableWidth) {
    return halfLeft;
  }

  return halfLeft + (usableWidth - component.width) / 2;
};

// Lane-relative X for non-flowing body components placed by the Guided
// planner. Components narrower than the lane center horizontally; wider ones
// clamp to the lane's left edge.
const getBodyPlacementX = (
  component: BuilderComponent,
  template: ShoppingListBuilderTemplate,
  lane: BuilderBodyLane,
): number => {
  if (getTemplateBodyLayoutMode(template) !== 'split' || lane === 'full') {
    return clamp(component.x, 0, template.paper.width - component.width);
  }
  const center = template.paper.width / 2;
  const halfLeft = lane === 'right' ? center : 0;
  const halfRight = lane === 'right' ? template.paper.width : center;
  const usableWidth = Math.max(0, halfRight - halfLeft);
  if (component.width >= usableWidth) {
    return halfLeft;
  }
  return halfLeft + (usableWidth - component.width) / 2;
};

const isBodyComponent = (
  component: BuilderComponent,
  template: ShoppingListBuilderTemplate,
) => getComponentRegion(component, template) === 'body';

interface FlowingTableState {
  component: SectionTableBuilderComponent;
  docIndex: number;
  metrics: SectionTableMetrics;
  rowHeights: number[];
  rowIndex: number;
  segmentIndex: number;
}

// Flowing-table planner. Mirrors the backend planner so canvas + Chromium HTML
// PDF render the same layout for the same template.
//
// - Guided (default): sequence-first. Flowing tables are placed in the order
//   they appear in `template.components` -- i.e. the user's add/reorder
//   sequence. Each table is fully placed (including continuations) before the
//   next is considered. Lanes are visited in reading order:
//   page0-left, page0-right, page1-left, page1-right, ...
//
// - Freeform: legacy two-phase planner that respects component.y for first
//   placement on a virgin lane and drains continuations per lane.
const createFlowingTablePlan = (
  template: ShoppingListBuilderTemplate,
  measurement?: SectionTableMeasurementOptions,
): FlowingTablePlan => {
  const maxPages = getTemplateMaxPages(template);
  const bodyBounds = getTemplateRegionBounds(template, 'body');
  const isSplit = getTemplateBodyLayoutMode(template) === 'split';
  const isGuided = getTemplateLayoutMode(template) === 'guided';
  const segments: FlowingTableSegment[] = [];
  const flowingComponentIds = new Set<string>();
  const bodyPlacements: BodyPlacement[] = [];
  const plannedBodyComponentIds = new Set<string>();
  let overflowRowCount = 0;
  let pageCount = 1;

  const orderedComponents = isGuided
    ? template.components.filter(
      (component): component is SectionTableBuilderComponent => isFlowingBodyTable(component, template),
    )
    : [...template.components.filter(
      (component): component is SectionTableBuilderComponent => isFlowingBodyTable(component, template),
    )].sort((first, second) => {
      if (first.y !== second.y) return first.y - second.y;
      return first.x - second.x;
    });

  const flowingTables = orderedComponents.map((component, docIndex): FlowingTableState => {
    flowingComponentIds.add(component.id);
    const metrics = getSectionTableMetrics(component, measurement);
    return {
      component,
      docIndex,
      metrics,
      rowHeights: getSectionTableRowHeights(component, metrics, measurement),
      rowIndex: 0,
      segmentIndex: 0,
    };
  });

  type LaneSlot = { pageIndex: number; lane: BuilderBodyLane };
  const laneSequence: LaneSlot[] = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    if (isSplit) {
      laneSequence.push({ pageIndex, lane: 'left' });
      laneSequence.push({ pageIndex, lane: 'right' });
    } else {
      laneSequence.push({ pageIndex, lane: 'full' });
    }
  }

  const tryPlace = (
    state: FlowingTableState,
    slot: LaneSlot,
    laneBounds: ReturnType<typeof getTemplateBodyLaneBounds>,
    cursor: number,
    isNative: boolean,
    options: { ignoreUserY?: boolean } = {},
  ): { newCursor: number; placed: boolean } => {
    const { component, metrics, rowHeights } = state;
    const isLaneVirgin = cursor <= laneBounds.top;
    const isOriginalSlot = state.segmentIndex === 0 && isNative;
    const honorUserY = !options.ignoreUserY && isOriginalSlot && isLaneVirgin;
    const baseTop = honorUserY
      ? Math.max(component.y, cursor, laneBounds.top)
      : Math.max(cursor, laneBounds.top);
    const availableTop = baseTop;
    const availableBottom = Math.min(laneBounds.bottom, bodyBounds.bottom);
    const availableHeight = availableBottom - availableTop;
    const nextRowHeight = rowHeights[state.rowIndex] ?? metrics.rowHeight;
    const segmentPlannerHeight = (rowsHeightValue: number) => getAdjustedSectionTablePlannerHeight(
      component,
      metrics.headerHeight + rowsHeightValue,
      measurement,
    );

    if (availableHeight < segmentPlannerHeight(Math.max(1, nextRowHeight))) {
      return { newCursor: cursor, placed: false };
    }

    const rows: SectionTableRow[] = [];
    const segmentRowHeights: number[] = [];
    let rowsHeight = 0;
    const startRowIndex = state.rowIndex;
    while (state.rowIndex < component.rows.length) {
      const candidateHeight = rowHeights[state.rowIndex] ?? metrics.rowHeight;
      const candidatePlannerHeight = segmentPlannerHeight(rowsHeight + candidateHeight);
      if (rows.length > 0 && candidatePlannerHeight > availableHeight) break;
      if (rows.length === 0 && candidatePlannerHeight > availableHeight) break;
      rows.push(component.rows[state.rowIndex]);
      segmentRowHeights.push(candidateHeight);
      rowsHeight += candidateHeight;
      state.rowIndex += 1;
    }

    if (rows.length === 0) {
      return { newCursor: cursor, placed: false };
    }

    const isFirstSegment = state.segmentIndex === 0;
    const height = segmentPlannerHeight(rowsHeight);
    segments.push({
      component,
      pageIndex: slot.pageIndex,
      lane: slot.lane,
      x: getFlowSegmentX(component, template, slot.lane, isFirstSegment),
      y: availableTop,
      width: component.width,
      height,
      rows,
      rowHeights: segmentRowHeights,
      startRowIndex,
      isFirstSegment,
      isContinuation: !isFirstSegment,
    });
    state.segmentIndex += 1;
    pageCount = Math.max(pageCount, slot.pageIndex + 1);
    return { newCursor: availableTop + height + FLOWING_TABLE_GAP, placed: true };
  };

  if (isGuided) {
    // Sequence-first: walk ALL body components in template.components order.
    //   - Flowing section-tables: place every row across as many lanes as
    //     needed (multi-segment).
    //   - Other body components (text, fixed section-tables, form-field
    //     groups, lines, dates, saved): place once. Advance to the next lane
    //     if the component does not fit; if it cannot fit on a virgin lane it
    //     anchors at the lane top so the user sees and can correct it.
    const flowingStateById = new Map<string, FlowingTableState>(
      flowingTables.map((state) => [state.component.id, state]),
    );
    let slotIdx = 0;
    let cursor = bodyBounds.top;
    const advanceSlot = () => {
      slotIdx += 1;
      cursor = bodyBounds.top;
    };

    const bodyComponents = template.components.filter((component) => isBodyComponent(component, template));
    bodyComponents.forEach((component) => plannedBodyComponentIds.add(component.id));

    for (const component of bodyComponents) {
      if (slotIdx >= laneSequence.length) break;

      if (isFlowingBodyTable(component, template)) {
        const state = flowingStateById.get(component.id)!;
        while (state.rowIndex < component.rows.length && slotIdx < laneSequence.length) {
          const slot = laneSequence[slotIdx];
          const laneBounds = getTemplateBodyLaneBounds(template, slot.lane);
          const { newCursor, placed } = tryPlace(state, slot, laneBounds, cursor, false, { ignoreUserY: true });
          if (placed) {
            cursor = newCursor;
          } else {
            advanceSlot();
            continue;
          }
          if (state.rowIndex < component.rows.length) {
            advanceSlot();
          }
        }
        overflowRowCount += component.rows.length - state.rowIndex;
      } else {
        const height = getCanvasComponentHeight(component, measurement);
        let placed = false;
        while (!placed && slotIdx < laneSequence.length) {
          const slot = laneSequence[slotIdx];
          const laneBounds = getTemplateBodyLaneBounds(template, slot.lane);
          const availableTop = Math.max(cursor, laneBounds.top);
          const availableBottom = Math.min(laneBounds.bottom, bodyBounds.bottom);
          const fitsHere = availableTop + height <= availableBottom;
          const isLaneVirgin = cursor <= laneBounds.top;
          if (fitsHere || isLaneVirgin) {
            bodyPlacements.push({
              componentId: component.id,
              pageIndex: slot.pageIndex,
              lane: slot.lane,
              x: getBodyPlacementX(component, template, slot.lane),
              y: availableTop,
              height,
            });
            cursor = availableTop + height + FLOWING_TABLE_GAP;
            pageCount = Math.max(pageCount, slot.pageIndex + 1);
            placed = true;
          } else {
            advanceSlot();
          }
        }
      }
    }

    return {
      pageCount: Math.min(maxPages, Math.max(pageCount, 1)),
      segments,
      flowingComponentIds,
      bodyPlacements,
      plannedBodyComponentIds,
      overflowRowCount,
    };
  }

  // Freeform planner (original two-phase, lane-by-lane allocation).
  const homeLaneOf = (state: FlowingTableState): BuilderBodyLane => (
    isSplit ? getComponentBodyLane(state.component, template) : 'full'
  );
  const nativesByLaneKey = new Map<string, FlowingTableState[]>();
  flowingTables.forEach((state) => {
    const key = `0:${homeLaneOf(state)}`;
    const list = nativesByLaneKey.get(key) ?? [];
    list.push(state);
    nativesByLaneKey.set(key, list);
  });
  nativesByLaneKey.forEach((list) => list.sort((a, b) => {
    if (a.component.y !== b.component.y) return a.component.y - b.component.y;
    return a.component.x - b.component.x;
  }));

  const pending: FlowingTableState[] = [];
  const insertByDocIndex = (state: FlowingTableState) => {
    let index = 0;
    while (index < pending.length && pending[index].docIndex <= state.docIndex) {
      index += 1;
    }
    pending.splice(index, 0, state);
  };

  laneSequence.forEach((slot) => {
    const laneBounds = getTemplateBodyLaneBounds(template, slot.lane);
    let cursor = bodyBounds.top;
    const natives = nativesByLaneKey.get(`${slot.pageIndex}:${slot.lane}`) ?? [];

    while (pending.length > 0) {
      const candidate = pending[0];
      const { newCursor, placed } = tryPlace(candidate, slot, laneBounds, cursor, false);
      if (!placed) break;
      cursor = newCursor;
      pending.shift();
      if (candidate.rowIndex < candidate.component.rows.length) {
        insertByDocIndex(candidate);
      }
    }

    natives.forEach((state) => {
      const { newCursor, placed } = tryPlace(state, slot, laneBounds, cursor, true);
      if (placed) {
        cursor = newCursor;
        if (state.rowIndex < state.component.rows.length) {
          insertByDocIndex(state);
        }
      } else {
        insertByDocIndex(state);
      }
    });
  });

  pending.forEach((state) => {
    overflowRowCount += state.component.rows.length - state.rowIndex;
  });

  // Freeform: planner only governs flowing tables; mirror them into the
  // planned set so the renderer/drag code can rely on a single membership
  // check across both modes.
  flowingComponentIds.forEach((id) => plannedBodyComponentIds.add(id));

  return {
    pageCount: Math.min(maxPages, Math.max(pageCount, 1)),
    segments,
    flowingComponentIds,
    bodyPlacements,
    plannedBodyComponentIds,
    overflowRowCount,
  };
};

interface GuidedInsertTarget {
  // The sequence index inside template.components where the dragged component
  // should be re-inserted (computed AFTER the dragged component is removed).
  sequenceIndex: number;
  pageIndex: number;
  lane: BuilderBodyLane;
  x: number;
  y: number;
  width: number;
}

// Compute drop targets for drag-reorder of body components in Guided Mode.
// Targets sit before/between/after each placed body component (flowing tables
// AND single-placement components) in plan reading order. The dragged
// component is excluded so the target index maps cleanly to a post-removal
// splice position in template.components.
const computeGuidedInsertTargets = (
  template: ShoppingListBuilderTemplate,
  plan: FlowingTablePlan,
  draggedComponentId: string,
): GuidedInsertTarget[] => {
  if (getTemplateLayoutMode(template) !== 'guided') return [];

  const bodyBounds = getTemplateRegionBounds(template, 'body');
  const remainingComponents = template.components.filter((c) => c.id !== draggedComponentId);
  const sequenceIndexOf = (componentId: string) => {
    const idx = remainingComponents.findIndex((c) => c.id === componentId);
    return idx === -1 ? remainingComponents.length : idx;
  };

  const laneXAndWidth = (pageLane: BuilderBodyLane) => {
    const lb = getTemplateBodyLaneBounds(template, pageLane);
    return { x: lb.left, width: Math.max(1, lb.right - lb.left) };
  };

  // Build a unified ordered list of placed body components: for each component
  // in template.components order (excluding the dragged one), capture its
  // first placement (top) and last placement (tail) on the page.
  type PlacedRef = {
    componentId: string;
    firstPageIndex: number;
    firstLane: BuilderBodyLane;
    firstY: number;
    lastPageIndex: number;
    lastLane: BuilderBodyLane;
    lastBottom: number;
  };
  const placed: PlacedRef[] = [];
  for (const component of template.components) {
    if (component.id === draggedComponentId) continue;
    if (!plan.plannedBodyComponentIds.has(component.id)) continue;
    const segs = plan.segments.filter((s) => s.component.id === component.id);
    if (segs.length > 0) {
      const head = segs[0];
      const tail = segs[segs.length - 1];
      placed.push({
        componentId: component.id,
        firstPageIndex: head.pageIndex,
        firstLane: head.lane,
        firstY: head.y,
        lastPageIndex: tail.pageIndex,
        lastLane: tail.lane,
        lastBottom: tail.y + tail.height,
      });
      continue;
    }
    const placement = plan.bodyPlacements.find((p) => p.componentId === component.id);
    if (placement) {
      placed.push({
        componentId: component.id,
        firstPageIndex: placement.pageIndex,
        firstLane: placement.lane,
        firstY: placement.y,
        lastPageIndex: placement.pageIndex,
        lastLane: placement.lane,
        lastBottom: placement.y + placement.height,
      });
    }
  }

  const targets: GuidedInsertTarget[] = [];

  if (placed.length === 0) {
    const lane: BuilderBodyLane = getTemplateBodyLayoutMode(template) === 'split' ? 'left' : 'full';
    const { x, width } = laneXAndWidth(lane);
    targets.push({
      sequenceIndex: remainingComponents.length,
      pageIndex: 0,
      lane,
      x,
      y: bodyBounds.top,
      width,
    });
    return targets;
  }

  // Before first placement.
  {
    const first = placed[0];
    const { x, width } = laneXAndWidth(first.firstLane);
    targets.push({
      sequenceIndex: sequenceIndexOf(first.componentId),
      pageIndex: first.firstPageIndex,
      lane: first.firstLane,
      x,
      y: bodyBounds.top,
      width,
    });
  }

  // Between consecutive placements.
  for (let i = 0; i < placed.length - 1; i += 1) {
    const a = placed[i];
    const b = placed[i + 1];
    const sameLane = a.lastPageIndex === b.firstPageIndex && a.lastLane === b.firstLane;
    if (sameLane) {
      const midY = (a.lastBottom + b.firstY) / 2;
      const { x, width } = laneXAndWidth(a.lastLane);
      targets.push({
        sequenceIndex: sequenceIndexOf(b.componentId),
        pageIndex: a.lastPageIndex,
        lane: a.lastLane,
        x,
        y: midY,
        width,
      });
    } else {
      const { x, width } = laneXAndWidth(b.firstLane);
      targets.push({
        sequenceIndex: sequenceIndexOf(b.componentId),
        pageIndex: b.firstPageIndex,
        lane: b.firstLane,
        x,
        y: bodyBounds.top,
        width,
      });
    }
  }

  // After last placement.
  {
    const last = placed[placed.length - 1];
    const { x, width } = laneXAndWidth(last.lastLane);
    targets.push({
      sequenceIndex: remainingComponents.length,
      pageIndex: last.lastPageIndex,
      lane: last.lastLane,
      x,
      y: last.lastBottom + FLOWING_TABLE_GAP / 2,
      width,
    });
  }

  return targets;
};

const findNearestInsertTarget = (
  targets: GuidedInsertTarget[],
  paperHeight: number,
  cursor: { pageIndex: number; x: number; y: number },
  toleranceY: number,
  toleranceX: number,
): GuidedInsertTarget | null => {
  if (targets.length === 0) return null;
  const cursorFlat = cursor.pageIndex * paperHeight + cursor.y;
  let best: GuidedInsertTarget | null = null;
  let bestScore = Infinity;
  for (const target of targets) {
    const targetFlat = target.pageIndex * paperHeight + target.y;
    const yDist = Math.abs(targetFlat - cursorFlat);
    const left = target.x;
    const right = target.x + target.width;
    const xDist = cursor.x < left ? left - cursor.x : cursor.x > right ? cursor.x - right : 0;
    if (yDist > toleranceY || xDist > toleranceX) continue;
    const score = yDist + xDist;
    if (score < bestScore) {
      bestScore = score;
      best = target;
    }
  }
  return best;
};

const cloneTemplate = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const componentTypeLabel = (type: BuilderComponentType) => {
  switch (type) {
    case 'form-field-group':
      return 'Form fields';
    case 'section-table':
      return 'Section table';
    case 'line':
      return 'Line';
    case 'date':
      return 'Date';
    case 'language-tag':
      return 'Language tag';
    case 'legend':
      return 'Legend';
    case 'text':
    default:
      return 'Text block';
  }
};

const translationModeLabel = (mode: BuilderTranslationMode): string => {
  switch (mode) {
    case 'skip':
      return 'Do not translate';
    case 'translate-with-original':
      return 'Include English';
    case 'translate-with-original-block':
      return 'Include English (with line break)';
    case 'translate-with-original-adaptive':
      return 'Include English (adaptive)';
    case 'translate':
    default:
      return 'Translate';
  }
};

const languageTagModeLabel = (mode: BuilderLanguageTagMode): string => {
  switch (mode) {
    case 'hide-english':
      return 'Hide tag for English';
    case 'native':
      return 'Translate language tag';
    case 'native-with-english':
      return 'Translate language tag and include English';
    case 'english':
    default:
      return 'Show language tag in English only';
  }
};

const componentRegionLabel = (region: BuilderComponentRegion) => {
  switch (region) {
    case 'header':
      return 'Header';
    case 'footer':
      return 'Footer';
    case 'body':
    default:
      return 'Body';
  }
};

const componentRegionDescription = (region: BuilderComponentRegion) => {
  switch (region) {
    case 'header':
      return 'Repeats above page body content';
    case 'footer':
      return 'Repeats below page body content';
    case 'body':
    default:
      return 'Flows between header and footer';
  }
};

const componentRegionBadgeClass = (region: BuilderComponentRegion) => {
  switch (region) {
    case 'header':
    case 'footer':
      return 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/10';
    case 'body':
    default:
      return 'border-border bg-background text-foreground hover:bg-accent';
  }
};

const headerFooterRepeatModeLabel = (mode: BuilderHeaderFooterRepeatMode) => {
  switch (mode) {
    case 'odd':
      return 'Show on odd pages';
    case 'even':
      return 'Show on even pages';
    case 'once':
      return 'Show once';
    case 'every':
    default:
      return 'Show on every page';
  }
};

const headerFooterRepeatModeShortLabel = (mode: BuilderHeaderFooterRepeatMode) => {
  switch (mode) {
    case 'odd':
      return 'Odd pages';
    case 'even':
      return 'Even pages';
    case 'once':
      return 'Once';
    case 'every':
    default:
      return 'Every page';
  }
};

const headerFooterRepeatModeDescription = (mode: BuilderHeaderFooterRepeatMode) => {
  switch (mode) {
    case 'odd':
      return 'Render on pages 1, 3, 5, ...';
    case 'even':
      return 'Render on pages 2, 4, 6, ...';
    case 'once':
      return 'Render only on the first page';
    case 'every':
    default:
      return 'Render on every page';
  }
};

const bodyLayoutModeLabel = (mode: BuilderBodyLayoutMode) => {
  switch (mode) {
    case 'split':
      return 'Split page';
    case 'full':
    default:
      return 'Full page';
  }
};

const printModeLabel = (mode: BuilderPrintMode) => {
  switch (mode) {
    case 'two-sided-duplicate':
      return 'Make 2-sided';
    case 'two-sided-when-single-page':
      // Render-time only (used by the bulk translated-PDF export modal). The
      // Properties panel does not surface this option, but the badge in the
      // canvas page header would render this label if the value showed up.
      return 'Two-sided (single page only)';
    case 'single-sided':
    default:
      return 'Single-sided';
  }
};

const getRegionForPoint = (
  y: number,
  template: ShoppingListBuilderTemplate,
): BuilderComponentRegion => {
  const headerHeight = getTemplateHeaderHeight(template);
  const footerTop = template.paper.height - getTemplateFooterHeight(template);

  if (headerHeight > 0 && y < headerHeight) {
    return 'header';
  }

  if (getTemplateFooterHeight(template) > 0 && y >= footerTop) {
    return 'footer';
  }

  return DEFAULT_COMPONENT_REGION;
};

const inferComponentRegion = (
  component: BuilderComponent,
  template: ShoppingListBuilderTemplate,
): BuilderComponentRegion => {
  const midpoint = component.y + getCanvasComponentHeight(component) / 2;
  return getRegionForPoint(midpoint, template);
};

const isInventorySectionTable = (
  component: BuilderComponent,
): component is SectionTableBuilderComponent => (
  component.type === 'section-table' && Boolean(component.inventorySource?.categoryId)
);

const getComponentRegion = (
  component: BuilderComponent,
  template: ShoppingListBuilderTemplate,
): BuilderComponentRegion => (
  isInventorySectionTable(component) ? 'body' : component.region ?? inferComponentRegion(component, template)
);

const getSectionTableFlowMode = (component: SectionTableBuilderComponent) => (
  ENABLE_FLOWING_TABLE_PREVIEW && component.flowMode === 'flowing' ? 'flowing' : 'fixed'
);

const getComponentBodyLane = (
  component: BuilderComponent,
  template: ShoppingListBuilderTemplate,
): BuilderBodyLane => {
  if (getTemplateBodyLayoutMode(template) !== 'split' || getComponentRegion(component, template) !== 'body') {
    return 'full';
  }

  return component.x + component.width / 2 >= template.paper.width / 2 ? 'right' : 'left';
};

const getComponentPlacementBounds = (
  component: BuilderComponent,
  template: ShoppingListBuilderTemplate,
  region: BuilderComponentRegion,
) => {
  const regionBounds = getTemplateRegionBounds(template, region);
  const lane = getComponentBodyLane({ ...component, region } as BuilderComponent, template);
  const laneBounds = region === 'body' && getTemplateLayoutMode(template) === 'guided'
    ? getTemplateBodyLaneBounds(template, lane)
    : null;

  return {
    region,
    lane,
    left: laneBounds?.left ?? 0,
    right: laneBounds?.right ?? template.paper.width,
    top: regionBounds.top,
    bottom: regionBounds.bottom,
  };
};

const componentRect = (component: BuilderComponent) => ({
  left: component.x,
  right: component.x + component.width,
  top: component.y,
  bottom: component.y + getCanvasComponentHeight(component),
});

const rectanglesOverlap = (
  first: ReturnType<typeof componentRect>,
  second: ReturnType<typeof componentRect>,
  gap = 0,
) => (
  first.left < second.right + gap
  && first.right + gap > second.left
  && first.top < second.bottom + gap
  && first.bottom + gap > second.top
);

const resolveGuidedCollision = (
  component: BuilderComponent,
  template: ShoppingListBuilderTemplate,
  excludeComponentId?: string,
) => {
  if (getTemplateLayoutMode(template) !== 'guided') {
    return component;
  }

  const region = getComponentRegion(component, template);
  const lane = getComponentBodyLane(component, template);
  const displayHeight = getCanvasComponentHeight(component);
  const bounds = getComponentPlacementBounds(component, template, region);
  const minY = bounds.top;
  const maxY = Math.max(minY, bounds.bottom - displayHeight);
  const gridSize = getTemplateGridSize(template);
  const colliders = template.components.filter((current) => (
    current.id !== (excludeComponentId ?? component.id)
    && getComponentRegion(current, template) === region
    && getComponentBodyLane(current, template) === lane
  ));

  const isAvailable = (y: number) => {
    const candidate = componentRect({ ...component, y } as BuilderComponent);
    return colliders.every((current) => !rectanglesOverlap(candidate, componentRect(current), GUIDED_COLLISION_GAP));
  };

  const requestedY = clamp(component.y, minY, maxY);
  if (isAvailable(requestedY)) {
    return { ...component, y: requestedY } as BuilderComponent;
  }

  const candidates = new Set<number>([requestedY]);
  for (let y = minY; y <= maxY; y += gridSize) {
    candidates.add(snapToGrid(y, gridSize));
  }
  colliders.forEach((current) => {
    candidates.add(snapToGrid(componentRect(current).bottom + GUIDED_COLLISION_GAP, gridSize));
    candidates.add(snapToGrid(componentRect(current).top - displayHeight - GUIDED_COLLISION_GAP, gridSize));
  });

  const orderedCandidates = Array.from(candidates)
    .map((y) => clamp(y, minY, maxY))
    .sort((a, b) => Math.abs(a - requestedY) - Math.abs(b - requestedY));
  const availableY = orderedCandidates.find(isAvailable);

  if (availableY == null) {
    return { ...component, y: requestedY } as BuilderComponent;
  }

  return { ...component, y: availableY } as BuilderComponent;
};

const canPlaceComponentInRegion = (
  component: BuilderComponent,
  template: ShoppingListBuilderTemplate,
  region: BuilderComponentRegion,
) => {
  if (isInventorySectionTable(component)) {
    return region === 'body';
  }

  const bounds = getTemplateRegionBounds(template, region);
  if (bounds.height <= 0) {
    return false;
  }

  if (region === 'body') {
    return true;
  }

  return getCanvasComponentHeight(component) <= bounds.height;
};

const resolveComponentRegion = (
  component: BuilderComponent,
  template: ShoppingListBuilderTemplate,
  preferredRegion?: BuilderComponentRegion,
): BuilderComponentRegion => {
  if (isInventorySectionTable(component)) {
    return 'body';
  }

  const requestedRegion = preferredRegion ?? getComponentRegion(component, template);

  if (canPlaceComponentInRegion(component, template, requestedRegion)) {
    return requestedRegion;
  }

  if (requestedRegion !== 'body' && canPlaceComponentInRegion(component, template, 'body')) {
    return 'body';
  }

  return requestedRegion;
};

const clampComponentToTemplateRegion = (
  component: BuilderComponent,
  template: ShoppingListBuilderTemplate,
  preferredRegion?: BuilderComponentRegion,
  options: { avoidCollisions?: boolean; excludeComponentId?: string } = {},
): BuilderComponent => {
  const region = resolveComponentRegion(component, template, preferredRegion);
  const bounds = getComponentPlacementBounds(component, template, region);
  const displayHeight = getCanvasComponentHeight(component);
  const maxX = Math.max(bounds.left, bounds.right - component.width);
  const maxY = Math.max(bounds.top, bounds.bottom - displayHeight);
  const clamped = {
    ...component,
    region,
    x: clamp(component.x, bounds.left, maxX),
    y: clamp(component.y, bounds.top, maxY),
  } as BuilderComponent;

  return options.avoidCollisions
    ? resolveGuidedCollision(clamped, template, options.excludeComponentId)
    : clamped;
};

const clampTemplateComponentsToRegions = (
  template: ShoppingListBuilderTemplate,
  options: { avoidCollisions?: boolean } = {},
): ShoppingListBuilderTemplate => {
  const nextTemplate: ShoppingListBuilderTemplate = { ...template, components: [] };
  nextTemplate.components = template.components.map((component) => {
    const placed = clampComponentToTemplateRegion(component, nextTemplate, undefined, {
      avoidCollisions: options.avoidCollisions,
      excludeComponentId: component.id,
    });
    nextTemplate.components.push(placed);
    return placed;
  });

  return nextTemplate;
};

const annotateTemplateComponentRegions = (
  template: ShoppingListBuilderTemplate,
): ShoppingListBuilderTemplate => ({
  ...template,
  components: template.components.map((component) => ({
    ...component,
    region: getComponentRegion(component, template),
  } as BuilderComponent)),
});

const limitSourceLabel = (row: SectionTableRow) => {
  if (!row.foodItemId) return 'Manual';

  switch (row.limitSource) {
    case 'food-item':
      return 'Item';
    case 'category':
      return 'Category';
    case 'none':
    default:
      return 'No limit';
  }
};

const formatCategoryLimitTag = (
  limit: number | null | undefined,
  limitType: 'person' | 'household' | null | undefined,
): string | null => {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) {
    return null;
  }

  if (limitType === 'person') {
    return `Choose up to ${limit} per person`;
  }

  if (limit === 1) {
    return 'Choose one';
  }

  if (limit === 2) {
    return 'Choose two';
  }

  return `Choose up to ${limit}`;
};

const cloneComponentForCanvas = (
  component: BuilderComponent,
  paperWidth: number,
  paperHeight: number,
): BuilderComponent => {
  const clone = cloneTemplate(component);
  const displayHeight = getCanvasComponentHeight(clone);
  const x = Number.isFinite(clone.x) ? clone.x : 48;
  const y = Number.isFinite(clone.y) ? clone.y : 48;

  return {
    ...clone,
    id: `${clone.id}-instance-${Date.now()}`,
    x: clamp(x, 0, paperWidth - clone.width),
    y: clamp(y, 0, paperHeight - displayHeight),
  } as BuilderComponent;
};

// B3: resolve the text shown in a row's Limit cell. A row carries only its own
// item-level limit; when it has none ("No Limit") and the table has not opted
// out of `showGlobalLimit` (default ON, ISSUES.md #39), fall back to the live
// org-wide Global Limit value. MUST mirror `resolveRowLimitText` in the
// backend route.
function resolveRowLimitText(
  rowLimit: string,
  showGlobalLimit: boolean,
  globalLimit: number | null | undefined,
): string {
  if (rowLimit && rowLimit.length > 0) return rowLimit;
  if (showGlobalLimit && globalLimit != null) return String(globalLimit);
  return rowLimit;
}

// A6: resolve the effective Want-column control for a section table. The
// table-level `component.wantControl` is the source of truth; when unset, fall
// back to legacy per-row `wantControl` ('checkbox' if ANY row carries it) so
// older saved templates render correctly. Lifted from per-row to table-level
// because the row-level setting never reliably persisted on inventory-backed
// tables (the refresh-inventory rebuild wipes per-row fields) and the use case
// is "apply to all rows" anyway. See ISSUES.md #43.
// MUST mirror `resolveSectionTableWantControl` in the backend route.
function resolveSectionTableWantControl(
  component: SectionTableBuilderComponent,
): 'blank' | 'checkbox' {
  if (component.wantControl === 'checkbox') return 'checkbox';
  if (component.wantControl === 'blank') return 'blank';
  if (component.rows.some((row) => row.wantControl === 'checkbox')) return 'checkbox';
  return 'blank';
}

function PreviewText({ component }: { component: TextBuilderComponent }) {
  // Pull the canvas-wide preview language + cache map from context. When
  // language === '' the canvas is in its default English state and we
  // render component.content directly. When a language is active we
  // honour the per-component translationMode (default 'translate') and
  // produce the same body the backend renderer emits to PDF.
  const { language, translations } = usePreviewLanguage();
  const cachedTranslation = language && translations[component.content]
    ? translations[component.content]
    : null;
  const mode = component.translationMode ?? DEFAULT_BUILDER_TRANSLATION_MODE;
  const body = language
    ? renderTextBody(component.content, cachedTranslation, mode)
    : component.content;
  const isTranslated = Boolean(language && cachedTranslation && mode !== 'skip');
  const isRtl = isTranslated && isRTLLanguage(language);
  const textAlign = component.align === 'center'
    ? 'center'
    : isRtl
      ? (component.align === 'left' ? 'right' : 'left')
      : component.align;

  return (
    <div
      dir="auto"
      className="h-full w-full whitespace-pre-line"
      style={{
        fontSize: component.fontSize,
        fontWeight: component.fontWeight === 'bold' ? 700 : 400,
        lineHeight: component.lineHeight,
        textAlign,
        unicodeBidi: 'plaintext',
      }}
    >
      {body}
    </div>
  );
}

function PreviewFormFields({ component }: { component: FormFieldGroupBuilderComponent }) {
  const { language, translations } = usePreviewLanguage();
  const measurement = language ? { language, translations } : undefined;
  const labelWidth = Math.min(component.labelWidth, component.width - 24);
  const valueWidth = component.width - labelWidth;
  const cornerRadius = Math.max(0, component.cornerRadius ?? 0);
  // Font-aware per-row height. 10pt -> 18pt (no change), 14-18pt -> 27pt.
  // Each row's actual min-height is perRow * lineCount so wrapped labels grow
  // to a 9pt-multiple (e.g. 36pt or 54pt) instead of stretching to fit
  // arbitrary content height. Keeps the form's bottom edge on the grid.
  const perRow = typographyBaseRowHeight(component.fontSize);
  const labelAvailableWidth = Math.max(1, labelWidth - 6);
  // RTL preview language: dir="rtl" reverses the label|value grid columns
  // (label moves to the right) and flips text alignment. The label|value
  // divider picks its physical edge explicitly from the table direction --
  // see the matching note in PreviewSectionTable for why a logical
  // border-inline-start is unsafe next to dir="auto" cells.
  const isRtl = isRTLLanguage(language);
  const dividerClass = isRtl ? 'border-r' : 'border-l';
  // A1/A3 (forms, mirror of section tables): default ON for back-compat.
  // showColumnDividers gates the vertical label|value divider; showBorders
  // gates the outer box + horizontal row separators.
  const showColumnDividers = component.showColumnDividers !== false;
  const showBorders = component.showBorders !== false;
  const colDivider = showColumnDividers ? dividerClass : '';

  return (
    <div
      dir={isRtl ? 'rtl' : undefined}
      className={cn('w-full bg-white', showBorders && 'border border-[#a8a8a8]')}
      style={{
        fontSize: component.fontSize,
        borderRadius: cornerRadius,
        overflow: cornerRadius > 0 ? 'hidden' : undefined,
      }}
    >
      {component.fields.map((field, index) => {
        const mode = field.translationMode ?? DEFAULT_BUILDER_TRANSLATION_MODE;
        const lineCount = language && builderGeneratedTextUsesTranslation(field.label, mode, measurement)
          ? estimateWrappedSegmentLineCount(
            builderGeneratedTextSegments(field.label, mode, component.fontSize, measurement),
            labelAvailableWidth,
          )
          : typographyEstimateLineCount(field.label, labelAvailableWidth, component.fontSize);
        const fieldRowHeight = Math.max(perRow, perRow * lineCount);
        const renderedLabel = language
          ? renderTranslatedBuilderText(field.label, translations[field.label], mode)
          : field.label;
        return (
          <div
            key={field.id}
            className={cn('grid', showBorders && index > 0 && 'border-t border-[#a8a8a8]')}
            style={{
              gridTemplateColumns: `${labelWidth}px ${valueWidth}px`,
              minHeight: fieldRowHeight,
            }}
          >
            <div
              dir="auto"
              className="px-[3px] [unicode-bidi:plaintext]"
              style={{
                paddingTop: BUILDER_CELL_VERTICAL_PADDING_PT,
                paddingBottom: BUILDER_CELL_VERTICAL_PADDING_PT,
                lineHeight: BUILDER_LINE_HEIGHT_MULTIPLIER,
              }}
            >
              {renderedLabel}
            </div>
            <div className={cn('border-[#a8a8a8]', colDivider)} />
          </div>
        );
      })}
    </div>
  );
}

function PreviewSectionTable({ component, rows = component.rows, rowHeights, includeCategoryIcons = false }: {
  component: SectionTableBuilderComponent;
  rows?: SectionTableRow[];
  rowHeights?: number[];
  includeCategoryIcons?: boolean;
}) {
  const { language, translations, inventoryTranslations, globalLimit } = usePreviewLanguage();
  const rowHeight = Number.isFinite(component.rowHeight) && component.rowHeight > 0
    ? component.rowHeight
    : DEFAULT_SECTION_TABLE_ROW_HEIGHT;
  const limitWidth = component.showLimit ? component.limitWidth : 0;
  const showWant = component.showWant !== false;
  // A6: table-level toggle (with legacy per-row fallback). Same value on every
  // row, computed once outside the row loop below.
  const wantCheckbox = resolveSectionTableWantControl(component) === 'checkbox';
  const wantWidth = showWant ? component.wantWidth : 0;
  const itemWidth = component.width - limitWidth - wantWidth;
  const measurement = language ? { language, translations, inventoryTranslations } : undefined;
  const translationSettings = resolveSectionTableTranslationSettings(component.translationSettings);
  const headerMode = translationSettings.headers ?? DEFAULT_BUILDER_TRANSLATION_MODE;
  const tagMode = translationSettings.tags ?? DEFAULT_BUILDER_TRANSLATION_MODE;
  const rowMode = translationSettings.rows ?? DEFAULT_BUILDER_TRANSLATION_MODE;
  // Compute the icon flag BEFORE measuring header geometry so the planner
  // subtracts the icon's title-cell width when wrapping long category
  // titles (ISSUES.md #26 follow-up).
  const shouldShowCategoryIcon = includeCategoryIcons && Boolean(component.inventorySource);
  const computedRowHeights = rowHeights ?? (
    rows === component.rows
      ? getSectionTableRowHeights(
        component,
        getSectionTableMetrics(component, measurement, { showCategoryIcon: shouldShowCategoryIcon }),
        measurement,
      )
      : undefined
  );
  const headerHeight = getTableHeaderHeight(component, rowHeight, {
    itemWidth,
    limitWidth,
    wantWidth,
    fontSize: component.fontSize,
    showLimit: component.showLimit,
    showWant,
    iconOverhead: categoryIconTitleWidthOverhead(component.fontSize, shouldShowCategoryIcon),
    ...sectionTableHeaderMeasurementSegments(component, component.fontSize, measurement),
  });
  // Columns in order: Item, [Limit if shown], [Want if shown]. Handles all
  // four combinations (A5): both, limit-only, want-only, names-only.
  const gridTemplateColumns = [
    `${itemWidth}px`,
    ...(component.showLimit ? [`${limitWidth}px`] : []),
    ...(showWant ? [`${wantWidth}px`] : []),
  ].join(' ');
  const categoryLimitTag = formatCategoryLimitTag(component.categoryLimit, component.categoryLimitType);
  const categoryLimitTagSource = categoryLimitTag ? `(${categoryLimitTag})` : null;
  // Inventory tables resolve the title from CategoryTranslation; base-
  // component tables resolve it from the Generated (List) cache.
  const categoryTranslation = language
    ? (component.inventorySource?.categoryId
      ? inventoryTranslations?.categories[component.inventorySource.categoryId]
      : translations[component.title])
    : undefined;
  const renderedTitle = renderTranslatedBuilderText(
    component.title,
    categoryTranslation,
    headerMode,
  );
  const CategoryIcon = shouldShowCategoryIcon
    ? getIconComponent(component.inventorySource?.categoryIcon || DEFAULT_ICON)
    : null;
  const cornerRadius = Math.max(0, component.cornerRadius ?? 0);
  // RTL preview language: dir="rtl" reverses the grid column order of the
  // header and every body row (Category | Limit | Want -> Want | Limit |
  // Category) and flips text alignment.
  const isRtl = isRTLLanguage(language);
  // Column dividers must resolve against the TABLE's direction, not each
  // cell's. The Limit/Want cells carry `dir="auto"` + `unicode-bidi:plaintext`
  // for correct text shaping, so a logical `border-inline-start` would flip
  // to the wrong physical edge whenever a cell's content is LTR (e.g. a digit
  // limit value or an untranslated "Limit" header) -- stacking both dividers
  // on the same side. Pick the physical edge explicitly from the table dir.
  const dividerClass = isRtl ? 'border-r' : 'border-l';
  // A1/A3: vertical column dividers and table/cell borders (outer box +
  // horizontal row rules) are independently toggleable; both default ON for
  // back-compat with templates that predate these flags.
  const showColumnDividers = component.showColumnDividers !== false;
  const showBorders = component.showBorders !== false;
  const colDivider = showColumnDividers ? dividerClass : '';

  return (
    <div
      dir={isRtl ? 'rtl' : undefined}
      className={cn('w-full bg-white', showBorders && 'border border-[#b9b9b9]')}
      style={{
        fontSize: component.fontSize,
        borderRadius: cornerRadius,
        overflow: cornerRadius > 0 ? 'hidden' : undefined,
      }}
    >
      <div
        className={cn('grid bg-white font-bold', showBorders && 'border-b border-[#b9b9b9]')}
        style={{ gridTemplateColumns, height: headerHeight }}
      >
        <div
          dir="auto"
          className={cn(
            // text-start (not text-left) so the title aligns to the
            // inline-start edge in both LTR and RTL renders.
            'flex flex-col justify-center px-1 text-start [unicode-bidi:plaintext]',
            shouldShowCategoryIcon ? 'items-start' : 'items-center text-center',
          )}
          style={{
            // Tagged headers stack title + tag without container padding; the
            // header band's min-height alone determines the box. Untagged
            // headers use the same body padding/line-height as data rows.
            paddingTop: categoryLimitTag ? 0 : BUILDER_CELL_VERTICAL_PADDING_PT,
            paddingBottom: categoryLimitTag ? 0 : BUILDER_CELL_VERTICAL_PADDING_PT,
            lineHeight: categoryLimitTag
              ? BUILDER_TAGGED_HEADER_LINE_HEIGHT_MULTIPLIER
              : BUILDER_LINE_HEIGHT_MULTIPLIER,
          }}
        >
          <span className="inline-flex max-w-full items-center gap-[2ch]">
            {CategoryIcon && <CategoryIcon aria-hidden="true" className="h-[1em] w-[1em] shrink-0" strokeWidth={2} />}
            <span className="min-w-0 whitespace-pre-wrap">{renderedTitle}</span>
          </span>
          {categoryLimitTag && (
            <span
              data-testid="builder-section-table-category-limit"
              className={cn(
                'block font-normal italic',
                CategoryIcon && 'pl-[calc(1em+3ch)]',
              )}
              style={{
                fontSize: Math.max(7, component.fontSize - 2),
                lineHeight: BUILDER_TAGGED_HEADER_LINE_HEIGHT_MULTIPLIER,
              }}
            >
              {renderTranslatedBuilderText(
                categoryLimitTagSource ?? '',
                categoryLimitTagSource ? translations[categoryLimitTagSource] : null,
                tagMode,
              )}
            </span>
          )}
        </div>
        {component.showLimit && (
          <div
            dir="auto"
            className={cn('flex items-center justify-center border-[#b9b9b9] px-1 [unicode-bidi:plaintext]', colDivider)}
            style={{ lineHeight: BUILDER_LINE_HEIGHT_MULTIPLIER }}
        >
            {renderTranslatedBuilderText(
              component.limitHeader || 'Limit',
              language ? translations[component.limitHeader || 'Limit'] : null,
              headerMode,
            )}
          </div>
        )}
        {showWant && (
          <div
            dir="auto"
            className={cn('flex items-center justify-center border-[#b9b9b9] px-1 [unicode-bidi:plaintext]', colDivider)}
            style={{ lineHeight: BUILDER_LINE_HEIGHT_MULTIPLIER }}
          >
            {renderTranslatedBuilderText(
              component.wantHeader || 'Want',
              language ? translations[component.wantHeader || 'Want'] : null,
              headerMode,
            )}
          </div>
        )}
      </div>
      {rows.map((row, index) => {
        const tableRowHeight = computedRowHeights?.[index] ?? getTableRowHeight(row, rowHeight, {
          itemWidth,
          limitWidth,
          fontSize: component.fontSize,
          showLimit: component.showLimit,
          showStatusIcons: component.showStatusIcons === true,
          itemSegments: sectionTableRowItemSegments(row, rowMode, component.fontSize, measurement),
          useNaturalContentHeight: sectionTableRowUsesTranslatedText(row, rowMode, measurement),
        });
        return (
          <div
            key={row.id}
            className={cn(
              'grid',
              showBorders && index < rows.length - 1 && 'border-b border-[#cfcfcf]',
            )}
            style={{
              gridTemplateColumns,
              height: tableRowHeight,
              backgroundColor: component.alternateRows && index % 2 === 0 ? '#e4e4e4' : '#ffffff',
            }}
          >
            <div
              className="flex items-start gap-1 px-1"
              style={{
                paddingTop: BUILDER_CELL_VERTICAL_PADDING_PT,
                paddingBottom: BUILDER_CELL_VERTICAL_PADDING_PT,
                lineHeight: BUILDER_LINE_HEIGHT_MULTIPLIER,
              }}
            >
              {component.showStatusIcons === true && (row.isLimited || row.isClearance) && (
                <span className="flex shrink-0 items-center gap-0.5" style={{ height: `${component.fontSize}px`, lineHeight: 1 }}>
                  {row.isLimited && (
                    <AlertTriangleIcon size={component.fontSize} style={{ color: '#000000' }} />
                  )}
                  {row.isClearance && (
                    <TagIcon size={component.fontSize} style={{ color: '#000000' }} />
                  )}
                </span>
              )}
              <span dir="auto" className="min-w-0 whitespace-pre-line [unicode-bidi:plaintext]">
                {renderTranslatedBuilderText(
                  row.item,
                  // Inventory rows resolve from FoodItemTranslation; base-
                  // component rows resolve from the Generated (List) cache.
                  language
                    ? (row.foodItemId
                      ? inventoryTranslations?.foodItems[row.foodItemId]
                      : translations[row.item])
                    : null,
                  rowMode,
                )}
              </span>
            </div>
            {component.showLimit && (
              <div
                dir="auto"
                className={cn('whitespace-pre-line border-[#cfcfcf] px-1 text-center [unicode-bidi:plaintext]', colDivider)}
                style={{
                  paddingTop: BUILDER_CELL_VERTICAL_PADDING_PT,
                  paddingBottom: BUILDER_CELL_VERTICAL_PADDING_PT,
                  lineHeight: BUILDER_LINE_HEIGHT_MULTIPLIER,
                }}
              >
                {resolveRowLimitText(row.limit, component.showGlobalLimit !== false, globalLimit)}
              </div>
            )}
            {showWant && (
              <div className={cn('flex items-center justify-center border-[#cfcfcf]', colDivider)}>
                {wantCheckbox && (
                  <span
                    className="inline-block border border-[#555555]"
                    style={{ width: 9, height: 9, borderRadius: 1 }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PreviewLine({ component }: { component: LineBuilderComponent }) {
  return (
    <div
      className="bg-black"
      style={{
        width: component.direction === 'horizontal' ? component.width : component.strokeWidth,
        height: component.direction === 'horizontal' ? component.strokeWidth : component.height,
      }}
    />
  );
}

function PreviewDate({ component }: { component: DateBuilderComponent }) {
  const { language, translations } = usePreviewLanguage();
  // For 'today' the date is recomputed on every render so the canvas stays
  // current as long as the builder is open. The PDF renderer mirrors this
  // behavior using server time, so canvas + PDF stay in lock step.
  const resolved = resolveBuilderDateInstance(component.dateMode, component.customDate);
  const formatted = formatBuilderDate(resolved, component.formatId ?? DEFAULT_DATE_FORMAT_ID);
  const mode = component.translationMode ?? DEFAULT_BUILDER_TRANSLATION_MODE;
  const body = language
    ? renderTextBody(formatted, translations[formatted] ?? null, mode)
    : formatted;
  return (
    <div
      dir="auto"
      data-testid="builder-date-preview"
      className="h-full w-full whitespace-pre-line"
      style={{
        fontSize: component.fontSize,
        fontWeight: component.fontWeight === 'bold' ? 700 : 400,
        lineHeight: component.lineHeight,
        textAlign: component.align,
        unicodeBidi: 'plaintext',
      }}
    >
      {body}
    </div>
  );
}

function PreviewLanguageTag({ component }: { component: LanguageTagBuilderComponent }) {
  const { language } = usePreviewLanguage();
  const label = resolveBuilderLanguageTagText(language, component.mode ?? DEFAULT_LANGUAGE_TAG_MODE);
  return (
    <div
      dir="auto"
      data-testid="builder-language-tag-preview"
      className="h-full w-full whitespace-pre-line"
      style={{
        fontSize: component.fontSize,
        fontWeight: component.fontWeight === 'bold' ? 700 : 400,
        lineHeight: component.lineHeight,
        textAlign: component.align,
        unicodeBidi: 'plaintext',
      }}
    >
      {label}
    </div>
  );
}

function PreviewLegend({ component }: { component: LegendBuilderComponent }) {
  // A4: explains the A2 status icons. Labels translate via the same Generated
  // (List) cache as text components; icons reuse the A2 lucide icons/colors.
  const { language, translations } = usePreviewLanguage();
  const renderLabel = (label: string) =>
    renderTranslatedBuilderText(label, language ? translations[label] : null, 'translate');
  const entries: Array<{ key: string; icon: React.ReactNode; label: string }> = [];
  if (component.showLimited) {
    entries.push({ key: 'limited', icon: <AlertTriangleIcon size={component.fontSize} style={{ color: '#000000' }} />, label: component.limitedLabel });
  }
  if (component.showClearance) {
    entries.push({ key: 'clearance', icon: <TagIcon size={component.fontSize} style={{ color: '#000000' }} />, label: component.clearanceLabel });
  }
  // RTL preview language: dir="rtl" flips the legend to read right-to-left —
  // entries pack from the right edge and each entry's icon leads on the right.
  // Mirrors the backend legendComponentHtml. Must match section-table/form RTL.
  const isRtl = isRTLLanguage(language);
  return (
    <div
      dir={isRtl ? 'rtl' : undefined}
      className={cn('flex w-full', component.layout === 'vertical' ? 'flex-col gap-1' : 'flex-row flex-wrap items-center gap-x-4 gap-y-1')}
      style={{ fontSize: component.fontSize, lineHeight: BUILDER_LINE_HEIGHT_MULTIPLIER }}
    >
      {entries.map((entry) => (
        <span key={entry.key} className="flex items-center gap-1">
          <span className="flex shrink-0 items-center" style={{ height: `${component.fontSize}px`, lineHeight: 1 }}>{entry.icon}</span>
          <span dir="auto" className="[unicode-bidi:plaintext]">{renderLabel(entry.label)}</span>
        </span>
      ))}
    </div>
  );
}

function PreviewComponent({ component, includeCategoryIcons = false }: {
  component: BuilderComponent;
  includeCategoryIcons?: boolean;
}) {
  switch (component.type) {
    case 'form-field-group':
      return <PreviewFormFields component={component} />;
    case 'section-table':
      return <PreviewSectionTable component={component} includeCategoryIcons={includeCategoryIcons} />;
    case 'line':
      return <PreviewLine component={component} />;
    case 'date':
      return <PreviewDate component={component} />;
    case 'language-tag':
      return <PreviewLanguageTag component={component} />;
    case 'legend':
      return <PreviewLegend component={component} />;
    case 'text':
    default:
      return <PreviewText component={component} />;
  }
}

function PageSetupPanel({
  layoutMode,
  bodyLayoutMode,
  gridSize,
  paperHeight,
  headerHeight,
  footerHeight,
  maxPages,
  printMode,
  includeCategoryIcons,
  onCommitHeader,
  onCommitFooter,
  onChangeBodyLayoutMode,
  onChangeMaxPages,
  onChangePrintMode,
  onChangeIncludeCategoryIcons,
}: {
  layoutMode: BuilderLayoutMode;
  bodyLayoutMode: BuilderBodyLayoutMode;
  gridSize: number;
  paperHeight: number;
  headerHeight: number;
  footerHeight: number;
  maxPages: number;
  printMode: BuilderPrintMode;
  includeCategoryIcons: boolean;
  onCommitHeader: (value: number) => void;
  onCommitFooter: (value: number) => void;
  onChangeBodyLayoutMode: (value: BuilderBodyLayoutMode) => void;
  onChangeMaxPages: (value: number) => void;
  onChangePrintMode: (value: BuilderPrintMode) => void;
  onChangeIncludeCategoryIcons: (value: boolean) => void;
}) {
  const [headerInput, setHeaderInput] = React.useState(String(headerHeight));
  const [footerInput, setFooterInput] = React.useState(String(footerHeight));

  React.useEffect(() => {
    setHeaderInput(String(headerHeight));
  }, [headerHeight]);

  React.useEffect(() => {
    setFooterInput(String(footerHeight));
  }, [footerHeight]);

  const commit = (raw: string, max: number, currentValue: number, onCommit: (value: number) => void) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      onCommit(currentValue);
      return;
    }
    const bounded = Math.max(0, Math.min(max, Math.round(parsed)));
    const snapped = layoutMode === 'guided' && bounded > 0 ? snapToGrid(bounded, gridSize) : bounded;
    onCommit(Math.max(0, Math.min(max, snapped)));
  };

  const headerMax = Math.max(0, paperHeight - footerHeight - HEADER_FOOTER_MIN_BODY);
  const footerMax = Math.max(0, paperHeight - headerHeight - HEADER_FOOTER_MIN_BODY);

  return (
    <div data-testid="builder-page-setup" className="space-y-3">
      <div>
        <BuilderSectionLabel
          className="text-sm font-semibold"
          icon={{ type: 'animate', icon: GalleryVerticalEndIcon }}
        >
          Page
        </BuilderSectionLabel>
        <p className="text-xs text-muted-foreground">
          Page anatomy, body layout, and print output. Numeric guides snap to {gridSize}pt in Guided mode.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            <Columns2 className="h-3.5 w-3.5" />
            Body Layout
          </Label>
          <Select value={bodyLayoutMode} onValueChange={(value) => onChangeBodyLayoutMode(value as BuilderBodyLayoutMode)}>
            <SelectTrigger data-testid="builder-body-layout-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">Full page</SelectItem>
              <SelectItem value="split">Split page</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            <Files className="h-3.5 w-3.5" />
            Max Pages
          </Label>
          <Select value={String(maxPages)} onValueChange={(value) => onChangeMaxPages(Number(value))}>
            <SelectTrigger data-testid="builder-max-pages-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((pageCount) => (
                <SelectItem key={pageCount} value={String(pageCount)}>
                  {pageCount}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <BuilderSectionLabel
            htmlFor="page-header-height"
            icon={{ type: 'animate', icon: ChevronUpIcon }}
          >
            Header (pt)
          </BuilderSectionLabel>
          <Input
            id="page-header-height"
            data-testid="builder-page-header-input"
            type="number"
            min={0}
            max={headerMax}
            value={headerInput}
            onChange={(event) => setHeaderInput(event.target.value)}
            onBlur={(event) => commit(event.target.value, headerMax, headerHeight, onCommitHeader)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <BuilderSectionLabel
            htmlFor="page-footer-height"
            icon={{ type: 'animate', icon: ChevronDownIcon }}
          >
            Footer (pt)
          </BuilderSectionLabel>
          <Input
            id="page-footer-height"
            data-testid="builder-page-footer-input"
            type="number"
            min={0}
            max={footerMax}
            value={footerInput}
            onChange={(event) => setFooterInput(event.target.value)}
            onBlur={(event) => commit(event.target.value, footerMax, footerHeight, onCommitFooter)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-1">
          <Printer className="h-3.5 w-3.5" />
          Print
        </Label>
        <Select value={printMode} onValueChange={(value) => onChangePrintMode(value as BuilderPrintMode)}>
          <SelectTrigger data-testid="builder-print-mode-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single-sided">Single-sided</SelectItem>
            <SelectItem value="two-sided-duplicate">Make 2-sided</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="builder-include-category-icons"
          checked={includeCategoryIcons}
          onCheckedChange={(value) => onChangeIncludeCategoryIcons(value === true)}
        />
        <Label htmlFor="builder-include-category-icons" className="cursor-pointer">
          Include Category Icons
        </Label>
      </div>
    </div>
  );
}

const DROPDOWN_ANIMATE_RESET_MS = 800;

function useDropdownAnimateMount() {
  const [animateMount, setAnimateMount] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (isOpen) {
      setAnimateMount(true);
      timerRef.current = setTimeout(() => {
        setAnimateMount(false);
        timerRef.current = null;
      }, DROPDOWN_ANIMATE_RESET_MS);
    } else {
      setAnimateMount(false);
    }
  }, []);
  return { animateMount, handleOpenChange };
}

function SectionTableRowActionsMenu({
  row,
  clearanceLabel,
  onEdit,
  onMarkOutOfStock,
  onMarkClearance,
  onChangeCategory,
  onDelete,
}: {
  row: { id: string; item: string; foodItemId?: number };
  clearanceLabel: string;
  onEdit: () => void;
  onMarkOutOfStock: () => void;
  onMarkClearance: () => void;
  onChangeCategory: () => void;
  onDelete: () => void;
}) {
  const { animateMount, handleOpenChange } = useDropdownAnimateMount();
  return (
    <DropdownMenu modal={false} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          data-testid="builder-section-row-actions"
          aria-label={`Manage ${row.item}`}
        >
          <AnimateIcon animate={animateMount} animateOnHover animateOnTap>
            <MoreHorizontalIcon size={16} />
          </AnimateIcon>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{row.item}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
          <DropdownMenuItem data-testid="builder-row-action-edit" onSelect={onEdit}>
            <SquarePenIcon size={16} className="mr-2" />
            Edit
          </DropdownMenuItem>
        </AnimateIcon>
        <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
          <DropdownMenuItem data-testid="builder-row-action-out-of-stock" onSelect={onMarkOutOfStock}>
            <PackageXIcon size={16} className="mr-2" />
            Mark Out of Stock
          </DropdownMenuItem>
        </AnimateIcon>
        <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
          <DropdownMenuItem data-testid="builder-row-action-clearance" onSelect={onMarkClearance}>
            <TagIcon size={16} className="mr-2" />
            {clearanceLabel}
          </DropdownMenuItem>
        </AnimateIcon>
        <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
          <DropdownMenuItem data-testid="builder-row-action-change-category" onSelect={onChangeCategory}>
            <ArrowLeftRightIcon size={16} className="mr-2" />
            Change Category
          </DropdownMenuItem>
        </AnimateIcon>
        <DropdownMenuSeparator />
        <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
          <DropdownMenuItem
            data-testid="builder-row-action-delete"
            className="text-destructive focus:text-destructive"
            onSelect={onDelete}
          >
            <Trash2Icon size={16} className="mr-2" />
            Delete
          </DropdownMenuItem>
        </AnimateIcon>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SavedComponentActionsMenu({
  savedComponent,
  onRename,
  onEdit,
  onDelete,
}: {
  savedComponent: SavedBuilderComponent;
  onRename: (sc: SavedBuilderComponent) => void;
  onEdit: (sc: SavedBuilderComponent) => void;
  onDelete: (sc: SavedBuilderComponent) => void;
}) {
  const { animateMount, handleOpenChange } = useDropdownAnimateMount();
  return (
    <DropdownMenu modal={false} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="saved-component-actions"
          className="h-8 w-8 shrink-0"
          aria-label={`Manage ${savedComponent.name}`}
        >
          <AnimateIcon animate={animateMount} animateOnHover animateOnTap>
            <MoreHorizontalIcon size={16} />
          </AnimateIcon>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Saved Component</DropdownMenuLabel>
        <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
          <DropdownMenuItem onSelect={() => onRename(savedComponent)}>
            <PencilIcon size={16} className="mr-2" />
            Rename
          </DropdownMenuItem>
        </AnimateIcon>
        <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
          <DropdownMenuItem onSelect={() => onEdit(savedComponent)}>
            <SquarePenIcon size={16} className="mr-2" />
            Edit
          </DropdownMenuItem>
        </AnimateIcon>
        <DropdownMenuSeparator />
        <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => onDelete(savedComponent)}
          >
            <Trash2Icon size={16} className="mr-2" />
            Delete
          </DropdownMenuItem>
        </AnimateIcon>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LayoutModeToggle({
  mode,
  onChange,
  animateOnMount,
}: {
  mode: BuilderLayoutMode;
  onChange: (mode: BuilderLayoutMode) => void;
  animateOnMount: boolean;
}) {
  const ModeIcon = mode === 'guided' ? Grid2x2CheckIcon : SquareDashedMousePointerIcon;
  const modeLabel = mode === 'guided' ? 'Guided' : 'Freeform';
  const { animateMount, handleOpenChange } = useDropdownAnimateMount();

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          data-testid="builder-layout-mode-trigger"
          data-layout-mode={mode}
          aria-label={`Layout mode: ${modeLabel}`}
        >
          <AnimateIcon animate={animateOnMount} animateOnHover animateOnTap>
            <ModeIcon size={16} />
          </AnimateIcon>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Layout Mode</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={mode} onValueChange={(value) => onChange(value as BuilderLayoutMode)}>
          <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
            <DropdownMenuRadioItem value="guided" data-testid="builder-layout-mode-guided">
              <Grid2x2CheckIcon size={16} className="mr-2" />
              Guided
            </DropdownMenuRadioItem>
          </AnimateIcon>
          <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
            <DropdownMenuRadioItem value="freeform" data-testid="builder-layout-mode-freeform">
              <SquareDashedMousePointerIcon size={16} className="mr-2" />
              Freeform
            </DropdownMenuRadioItem>
          </AnimateIcon>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GridGuidesToggle({
  shown,
  onChange,
  animateOnMount,
}: {
  shown: boolean;
  onChange: (next: boolean) => void;
  animateOnMount: boolean;
}) {
  const stateLabel = shown ? 'Show grid' : 'Hide grid';
  const { animateMount, handleOpenChange } = useDropdownAnimateMount();
  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          data-testid="builder-canvas-guides-toggle"
          data-grid-shown={shown ? 'true' : 'false'}
          aria-label={`Grid & guides: ${stateLabel}`}
        >
          <AnimateIcon animate={animateOnMount} animateOnHover animateOnTap>
            {shown ? <Grid3x3Icon size={16} /> : <GripIcon size={16} />}
          </AnimateIcon>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Grid &amp; Guides</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={shown ? 'on' : 'off'} onValueChange={(value) => onChange(value === 'on')}>
          <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
            <DropdownMenuRadioItem value="on" data-testid="builder-canvas-guides-on">
              <Grid3x3Icon size={16} className="mr-2" />
              Show grid
            </DropdownMenuRadioItem>
          </AnimateIcon>
          <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
            <DropdownMenuRadioItem value="off" data-testid="builder-canvas-guides-off">
              <GripIcon size={16} className="mr-2" />
              Hide grid
            </DropdownMenuRadioItem>
          </AnimateIcon>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// B3: shared instance for reading the org-wide Global Limit (the value shown
// in the Limit column for no-limit rows when a section table opts in).
const globalLimitService = new GlobalLimitService();

export function ShoppingListBuilder() {
  const terminology = useTerminology();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showSuccess, showWarning } = useMessage();
  const { categories, updateCategory, isSaving: isSavingCategory } = useCategoryContext();
  const {
    foodItems,
    refreshFoodItems,
    updateFoodItem,
    deleteFoodItem,
    createFoodItem,
    isSaving: isSavingFoodItem,
  } = useFoodItemContext();
  const [template, setTemplate] = useState(() => normalizeLegacyBuilderTemplateGeometry(createDefaultBuilderTemplate()));
  const [selectedId, setSelectedId] = useState<string>('');
  const [templateHistory, setTemplateHistory] = useState<Array<{ template: ShoppingListBuilderTemplate; selectedId: string }>>([]);
  // One-shot mount animation flag for persistent builder chrome (top action
  // bar, canvas toolbar). Per the documented animate-prop stuck-state
  // pitfall, this flips back to false after ~1s so subsequent hovers replay
  // the animation reliably. Satisfies Rule 4 (animate interactive icons on
  // page load) without breaking hover triggers on re-interaction.
  const [animateBuilderChromeMount, setAnimateBuilderChromeMount] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAnimateBuilderChromeMount(false), 1000);
    return () => clearTimeout(t);
  }, []);
  const [zoom, setZoom] = useState(CANVAS_DEFAULT_ZOOM);
  const [showCanvasGuides, setShowCanvasGuides] = useState(true);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSavingComponent, setIsSavingComponent] = useState(false);
  const [editingSavedComponentSource, setEditingSavedComponentSource] = useState<EditingSavedComponentSource | null>(null);
  const [renameSavedComponent, setRenameSavedComponent] = useState<SavedBuilderComponent | null>(null);
  const [renameSavedComponentName, setRenameSavedComponentName] = useState('');
  const [componentPendingDelete, setComponentPendingDelete] = useState<SavedBuilderComponent | null>(null);
  const [isDeletingSavedComponent, setIsDeletingSavedComponent] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [activeSavedTemplateId, setActiveSavedTemplateId] = useState<number | null>(null);
  const [isLoadingSavedComponents, setIsLoadingSavedComponents] = useState(false);
  const [isLoadingSavedTemplates, setIsLoadingSavedTemplates] = useState(false);
  const [isLoadingInventorySections, setIsLoadingInventorySections] = useState(false);
  const [savedComponents, setSavedComponents] = useState<SavedBuilderComponent[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<SavedBuilderTemplate[]>([]);
  const [hasLoadedSavedTemplates, setHasLoadedSavedTemplates] = useState(false);
  const [inventorySections, setInventorySections] = useState<InventorySectionComponent[]>([]);
  // B3: org-wide Global Limit value, shown in the Limit column for no-limit
  // rows when a section table has Show Global Limit enabled. Defaults to 10
  // (matching the backend) until the live value loads.
  const [globalLimit, setGlobalLimit] = useState<number>(10);
  const [editingFoodItem, setEditingFoodItem] = useState<FoodItem | null>(null);
  const [foodItemPendingDelete, setFoodItemPendingDelete] = useState<FoodItem | null>(null);
  const [isDeletingFoodItem, setIsDeletingFoodItem] = useState(false);
  const [changeCategoryItem, setChangeCategoryItem] = useState<FoodItem | null>(null);
  const [changeCategoryTargetId, setChangeCategoryTargetId] = useState<string>('');
  const [isChangingCategory, setIsChangingCategory] = useState(false);
  const [addItemContext, setAddItemContext] = useState<{ categoryId: number; categoryName: string } | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  // Canvas-wide translation preview state. `previewLanguage === ''` means
  // "no preview" -- the canvas renders the original English content. Any
  // other value triggers a one-shot preflight fetch (see effect below)
  // and provides cached translations to PreviewText via context. State is
  // NOT persisted on the template; it resets when the builder mounts.
  const [previewLanguage, setPreviewLanguage] = useState<string>('');
  const [previewTranslations, setPreviewTranslations] = useState<Record<string, string>>({});
  const [previewInventoryTranslations, setPreviewInventoryTranslations] = useState<{
    categories: Record<number, string>;
    foodItems: Record<number, string>;
  }>({ categories: {}, foodItems: {} });
  const [isFetchingPreviewTranslations, setIsFetchingPreviewTranslations] = useState(false);
  const [missingPreviewTranslations, setMissingPreviewTranslations] = useState<{
    language: string;
    missingStrings: string[];
    cached: Record<string, string>;
  } | null>(null);
  const [isUpdatingPreviewTranslations, setIsUpdatingPreviewTranslations] = useState(false);
  // Enabled-languages list for the action-bar Preview language Select.
  // Radix Select doesn't allow empty-string item values, so we use a
  // sentinel for the "English (no preview)" option and translate at the
  // change site.
  const { languages: allLanguagesForPreview, isLoading: isLoadingLanguages } = useLanguageContext();
  const enabledNonEnglishLanguages = useMemo(
    () => allLanguagesForPreview.filter((lang) => lang.isEnabled && lang.name !== 'English'),
    [allLanguagesForPreview],
  );
  const PREVIEW_LANGUAGE_NONE_SENTINEL = '__english__';
  // Translation Settings dialog open-state: we store the component id whose
  // settings are being edited rather than a boolean so the dialog re-mounts
  // (and resets its local state) when the user opens it for a different
  // text component without first closing the dialog.
  const [translationSettingsTargetId, setTranslationSettingsTargetId] = useState<string | null>(null);
  const [sectionTableTranslationSettingsTargetId, setSectionTableTranslationSettingsTargetId] = useState<string | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
    hasMoved: boolean;
  } | null>(null);
  const reorderRef = useRef<{
    componentId: string;
    pointerId: number;
  } | null>(null);
  const [reorderState, setReorderState] = useState<{
    componentId: string;
    target: GuidedInsertTarget | null;
  } | null>(null);
  const loadedTemplateFromUrlRef = useRef<number | null>(null);

  const editTemplateId = useMemo(() => {
    const rawTemplateId = searchParams.get('templateId');
    if (!rawTemplateId) return null;

    const parsedTemplateId = Number(rawTemplateId);
    return Number.isInteger(parsedTemplateId) && parsedTemplateId > 0
      ? parsedTemplateId
      : null;
  }, [searchParams]);

  const selectedComponent = useMemo(
    () => template.components.find((component) => component.id === selectedId) ?? null,
    [selectedId, template.components],
  );

  const layoutMode = getTemplateLayoutMode(template);
  const bodyLayoutMode = getTemplateBodyLayoutMode(template);
  const gridSize = getTemplateGridSize(template);
  const headerHeight = getTemplateHeaderHeight(template);
  const footerHeight = getTemplateFooterHeight(template);
  const bodyColumnGap = getTemplateBodyColumnGap(template);
  const maxPages = getTemplateMaxPages(template);
  const printMode = getTemplatePrintMode(template);
  const includeCategoryIcons = getTemplateIncludeCategoryIcons(template);
  const sectionTableMeasurement = useMemo<SectionTableMeasurementOptions | undefined>(() => (
    previewLanguage
      ? {
        language: previewLanguage,
        translations: previewTranslations,
        inventoryTranslations: previewInventoryTranslations,
      }
      : undefined
  ), [previewLanguage, previewInventoryTranslations, previewTranslations]);
  const flowingTablePlan = useMemo(
    () => createFlowingTablePlan(template, sectionTableMeasurement),
    [template, sectionTableMeasurement],
  );
  // Inventory sections behave like a "move from palette to canvas" model: once
  // a section's category is referenced by any section-table component on the
  // canvas, hide it from the scroll area. Deleting the canvas component (or
  // changing its inventorySource) restores the section to the palette pool.
  const placedInventoryCategoryIds = useMemo(() => {
    const ids = new Set<number>();
    template.components.forEach((component) => {
      if (component.type !== 'section-table') return;
      const categoryId = component.inventorySource?.categoryId;
      if (typeof categoryId === 'number') ids.add(categoryId);
    });
    return ids;
  }, [template.components]);
  const availableInventorySections = useMemo(
    () => inventorySections.filter((section) => !placedInventoryCategoryIds.has(section.categoryId)),
    [inventorySections, placedInventoryCategoryIds],
  );
  const selectedComponentRegion = selectedComponent ? getComponentRegion(selectedComponent, template) : null;
  const isEditingSelectedSavedComponent = (
    editingSavedComponentSource != null
    && editingSavedComponentSource.canvasComponentId === selectedComponent?.id
  );

  const snapCoord = useCallback(
    (value: number) => (layoutMode === 'guided' ? snapToGrid(value, gridSize) : value),
    [gridSize, layoutMode],
  );

  const getClickInsertXForBodyComponent = (objectWidth: number): number => {
    if (layoutMode !== 'guided' || bodyLayoutMode !== 'split') {
      return snapCoord(48);
    }

    return getCenteredXInBodyHalf(template.paper.width, objectWidth, 'left', gridSize);
  };

  const setLayoutMode = (nextMode: BuilderLayoutMode) => {
    if (nextMode === layoutMode) return;
    pushHistory();
    setTemplate((current) => {
      const nextTemplate = { ...current, layoutMode: nextMode };
      return nextMode === 'guided'
        ? clampTemplateComponentsToRegions(nextTemplate, { avoidCollisions: true })
        : nextTemplate;
    });
  };

  const setBodyLayoutMode = (nextMode: BuilderBodyLayoutMode) => {
    if (nextMode === bodyLayoutMode) return;
    pushHistory();
    setTemplate((current) => clampTemplateComponentsToRegions(
      { ...current, bodyLayoutMode: nextMode },
      { avoidCollisions: true },
    ));
  };

  const setMaxPages = (value: number) => {
    const nextMaxPages = clamp(Math.round(value), 1, 5);
    if (nextMaxPages === maxPages) return;
    pushHistory();
    setTemplate((current) => ({ ...current, maxPages: nextMaxPages }));
  };

  const setPrintMode = (nextMode: BuilderPrintMode) => {
    if (nextMode === printMode) return;
    pushHistory();
    setTemplate((current) => ({ ...current, printMode: nextMode }));
  };

  const setIncludeCategoryIcons = (value: boolean) => {
    if (value === includeCategoryIcons) return;
    pushHistory();
    setTemplate((current) => ({ ...current, includeCategoryIcons: value }));
  };

  const setHeaderHeight = (value: number) => {
    if (value === headerHeight) return;
    pushHistory();
    setTemplate((current) => clampTemplateComponentsToRegions(
      { ...current, headerHeight: value },
      { avoidCollisions: true },
    ));
  };

  const setFooterHeight = (value: number) => {
    if (value === footerHeight) return;
    pushHistory();
    setTemplate((current) => clampTemplateComponentsToRegions(
      { ...current, footerHeight: value },
      { avoidCollisions: true },
    ));
  };

  const loadSavedComponents = useCallback(async () => {
    try {
      setIsLoadingSavedComponents(true);
      const components = await shoppingListBuilderService.getSavedComponents();
      setSavedComponents(components);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderLoadSavedComponents');
    } finally {
      setIsLoadingSavedComponents(false);
    }
  }, []);

  const loadSavedTemplates = useCallback(async () => {
    try {
      setIsLoadingSavedTemplates(true);
      const templates = await shoppingListBuilderService.getSavedTemplates();
      setSavedTemplates(templates);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderLoadSavedTemplates');
    } finally {
      setHasLoadedSavedTemplates(true);
      setIsLoadingSavedTemplates(false);
    }
  }, []);

  const loadInventorySections = useCallback(async () => {
    try {
      setIsLoadingInventorySections(true);
      const sections = await shoppingListBuilderService.getInventorySections();
      setInventorySections(sections);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderLoadInventorySections');
    } finally {
      setIsLoadingInventorySections(false);
    }
  }, []);

  const loadGlobalLimit = useCallback(async () => {
    try {
      const limit = await globalLimitService.getGlobalLimit();
      setGlobalLimit(limit);
    } catch (error) {
      // Non-fatal: the canvas falls back to the default until this succeeds.
      ErrorHandlerService.handleError(error, 'shoppingListBuilderLoadGlobalLimit');
    }
  }, []);

  useEffect(() => {
    void loadSavedComponents();
    void loadSavedTemplates();
    void loadInventorySections();
    void refreshFoodItems();
    void loadGlobalLimit();
  }, [loadInventorySections, loadSavedComponents, loadSavedTemplates, refreshFoodItems, loadGlobalLimit]);

  // Build a stable, sorted signature of every translation-eligible string
  // in the current template. The fetch effect below depends on this
  // signature rather than the full `template` object so it only fires
  // when the strings themselves change -- not on every drag, resize, or
  // unrelated edit.
  const translatableStringsSignature = React.useMemo(() => {
    const strings: string[] = [];
    for (const component of template.components) {
      if (component.type !== 'text') continue;
      const mode = component.translationMode ?? DEFAULT_BUILDER_TRANSLATION_MODE;
      if (mode === 'skip') continue;
      const content = (component.content ?? '').trim();
      if (!content) continue;
      strings.push(component.content);
    }
    return Array.from(new Set(strings)).sort().join('');
  }, [template.components]);

  // Fetch cached translations when the user picks a preview language (or
  // when the template's translatable strings change while a preview is
  // already active). A preview language is only applied silently when every
  // eligible string has a cached translation. If any are missing, the user
  // chooses whether to fill the cache now or return to English.
  useEffect(() => {
    if (!previewLanguage) {
      // Clear stale translations when the user reverts to English so the
      // canvas snaps back immediately without a flash of stale content.
      setPreviewTranslations({});
      setPreviewInventoryTranslations({ categories: {}, foodItems: {} });
      setIsFetchingPreviewTranslations(false);
      setMissingPreviewTranslations(null);
      return;
    }
    let cancelled = false;
    setIsFetchingPreviewTranslations(true);
    (async () => {
      try {
        const result = await shoppingListBuilderService.translationPreflight(template, previewLanguage);
        if (cancelled) return;
        const decision = resolvePreviewTranslationPreflight(result);
        if (decision.status === 'missing') {
          setPreviewTranslations({});
          setPreviewInventoryTranslations(result.inventory ?? { categories: {}, foodItems: {} });
          setMissingPreviewTranslations({
            language: previewLanguage,
            missingStrings: decision.missingStrings,
            cached: decision.cached,
          });
          return;
        }
        setPreviewTranslations(decision.translations);
        setPreviewInventoryTranslations(result.inventory ?? { categories: {}, foodItems: {} });
        setMissingPreviewTranslations(null);
      } catch (error) {
        if (cancelled) return;
        ErrorHandlerService.handleError(error, 'shoppingListBuilderPreviewLanguageFetch');
        setPreviewTranslations({});
        setPreviewInventoryTranslations({ categories: {}, foodItems: {} });
        setMissingPreviewTranslations(null);
      } finally {
        if (!cancelled) setIsFetchingPreviewTranslations(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // template intentionally pulled by reference -- the actual dep is
    // translatableStringsSignature which captures the strings that
    // matter; we read `template` inside the effect for the API payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewLanguage, translatableStringsSignature]);

  const cancelPreviewTranslationUpdate = () => {
    setMissingPreviewTranslations(null);
    setPreviewTranslations({});
    setPreviewInventoryTranslations({ categories: {}, foodItems: {} });
    setPreviewLanguage('');
  };

  const updatePreviewTranslations = async () => {
    if (!missingPreviewTranslations || missingPreviewTranslations.missingStrings.length === 0) return;
    try {
      setIsUpdatingPreviewTranslations(true);
      const result = await shoppingListBuilderService.translateMissingStrings(
        missingPreviewTranslations.missingStrings,
        missingPreviewTranslations.language,
      );
      setPreviewTranslations(mergePreviewTranslations(
        missingPreviewTranslations.cached,
        result.translations,
      ));
      showSuccess(`Preview translations updated for ${missingPreviewTranslations.language}.`);
      setMissingPreviewTranslations(null);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderPreviewLanguageTranslateMissing');
    } finally {
      setIsUpdatingPreviewTranslations(false);
    }
  };

  useEffect(() => {
    if (editTemplateId == null) {
      loadedTemplateFromUrlRef.current = null;
      return;
    }

    if (!hasLoadedSavedTemplates || loadedTemplateFromUrlRef.current === editTemplateId) {
      return;
    }

    const savedTemplate = savedTemplates.find((current) => current.id === editTemplateId);
    if (!savedTemplate) {
      loadedTemplateFromUrlRef.current = editTemplateId;
      showWarning('Unable to open that saved template. It may have been deleted or belongs to another user.');
      return;
    }

    loadedTemplateFromUrlRef.current = editTemplateId;

    const loadTemplateForEditing = async () => {
      try {
        const refreshedTemplate = await shoppingListBuilderService.refreshTemplateInventory(savedTemplate.templateData);
        const templateToApply = normalizeLegacyBuilderTemplateGeometry(annotateTemplateComponentRegions({
          ...refreshedTemplate,
          name: limitTemplateName(refreshedTemplate.name),
        }));

        setTemplate(templateToApply);
        setSelectedId(templateToApply.components[0]?.id ?? '');
        setActiveSavedTemplateId(savedTemplate.id);
        setEditingSavedComponentSource(null);
        setTemplateHistory([]);
      } catch (error) {
        loadedTemplateFromUrlRef.current = null;
        ErrorHandlerService.handleError(error, 'shoppingListBuilderApplyTemplate');
      }
    };

    void loadTemplateForEditing();
  }, [editTemplateId, hasLoadedSavedTemplates, savedTemplates, showWarning]);

  const pushHistory = useCallback(() => {
    setTemplateHistory((current) => [
      { template: cloneTemplate(template), selectedId },
      ...current,
    ].slice(0, 50));
  }, [selectedId, template]);

  const undoLastChange = () => {
    const previous = templateHistory[0];
    if (!previous) {
      showWarning('There is nothing to undo.');
      return;
    }

    setTemplate(normalizeLegacyBuilderTemplateGeometry(previous.template));
    setSelectedId(previous.selectedId);
    setEditingSavedComponentSource(null);
    setTemplateHistory((current) => current.slice(1));
  };

  const updateComponent = (
    id: string,
    updater: (component: BuilderComponent) => BuilderComponent,
    options: { recordHistory?: boolean } = {},
  ) => {
    if (options.recordHistory !== false) {
      pushHistory();
    }

    setTemplate((current) => ({
      ...current,
      components: current.components.map((component) => (
        component.id === id
          ? clampComponentToTemplateRegion(updater(component), current, undefined, {
            avoidCollisions: true,
            excludeComponentId: id,
          })
          : component
      )),
    }));
  };

  const updateSelectedComponent = (
    updates: Partial<BuilderComponent>,
    options: { recordHistory?: boolean } = {},
  ) => {
    if (!selectedComponent) return;
    updateComponent(
      selectedComponent.id,
      (component) => ({ ...component, ...updates }) as BuilderComponent,
      options,
    );
  };

  const updateSelectedSectionTableTranslationHeightAdjustment = (nextValue: number) => {
    if (!selectedComponent || selectedComponent.type !== 'section-table' || !previewLanguage) return;
    const normalized = normalizeSectionTableTranslationHeightAdjustment(nextValue);
    const nextAdjustments = { ...(selectedComponent.translationHeightAdjustments ?? {}) };
    if (normalized === 0) {
      delete nextAdjustments[previewLanguage];
    } else {
      nextAdjustments[previewLanguage] = normalized;
    }
    updateSelectedComponent({
      translationHeightAdjustments: Object.keys(nextAdjustments).length > 0 ? nextAdjustments : undefined,
    } as Partial<SectionTableBuilderComponent>);
  };

  const changeComponentRegion = (componentId: string, region: BuilderComponentRegion) => {
    const component = template.components.find((current) => current.id === componentId);
    if (!component) return;

    if (isInventorySectionTable(component) && region !== 'body') {
      showWarning('Inventory section tables must stay in the Body region.');
      return;
    }

    if (!canPlaceComponentInRegion(component, template, region)) {
      showWarning(
        `${component.name} cannot fit in the ${componentRegionLabel(region).toLowerCase()} region. Increase that region or choose Body.`,
      );
      return;
    }

    pushHistory();
    setTemplate((current) => ({
      ...current,
      components: current.components.map((currentComponent) => (
        currentComponent.id === componentId
          ? clampComponentToTemplateRegion(
            {
              ...currentComponent,
              region,
            } as BuilderComponent,
            current,
            region,
            { avoidCollisions: true, excludeComponentId: componentId },
          )
          : currentComponent
      )),
    }));
    setSelectedId(componentId);
  };

  const changeComponentRepeatMode = (componentId: string, mode: BuilderHeaderFooterRepeatMode) => {
    const component = template.components.find((current) => current.id === componentId);
    if (!component) return;
    if ((component.repeatMode ?? 'every') === mode) return;
    pushHistory();
    setTemplate((current) => ({
      ...current,
      components: current.components.map((currentComponent) => (
        currentComponent.id === componentId
          ? ({ ...currentComponent, repeatMode: mode } as BuilderComponent)
          : currentComponent
      )),
    }));
    setSelectedId(componentId);
  };

  const addComponent = (type: BuilderComponentType, x = 48, y?: number) => {
    pushHistory();
    const defaultBodyY = getTemplateRegionBounds(template, 'body').top + gridSize;
    const requestedY = y ?? defaultBodyY;
    const requestedX = y == null
      ? getClickInsertXForBodyComponent(DEFAULT_BUILDER_COMPONENT_WIDTH)
      : x;
    const snappedX = snapCoord(requestedX);
    const snappedY = snapCoord(requestedY);
    const createdComponent = createBuilderComponent(type, snappedX, snappedY);
    const region = y == null ? 'body' : getRegionForPoint(snappedY, template);
    const component = clampComponentToTemplateRegion(
      {
        ...createdComponent,
        x: snappedX,
        y: snappedY,
        region,
      } as BuilderComponent,
      template,
      region,
      { avoidCollisions: true, excludeComponentId: createdComponent.id },
    );
    setTemplate((current) => ({
      ...current,
      components: [...current.components, component],
    }));
    setSelectedId(component.id);
    setEditingSavedComponentSource(null);
  };

  const deleteSelectedComponent = () => {
    if (!selectedComponent) {
      showWarning('Select a component before deleting it.');
      return;
    }

    const deletedId = selectedComponent.id;
    pushHistory();
    setTemplate((current) => {
      const remaining = current.components.filter((component) => component.id !== deletedId);
      setSelectedId(remaining[0]?.id ?? '');
      return { ...current, components: remaining };
    });
    if (editingSavedComponentSource?.canvasComponentId === deletedId) {
      setEditingSavedComponentSource(null);
    }
  };

  const duplicateSelectedComponent = () => {
    if (!selectedComponent) {
      showWarning('Select a component before duplicating it.');
      return;
    }

    const copyId = `${selectedComponent.id}-copy-${Date.now()}`;
    const copy = clampComponentToTemplateRegion({
      ...selectedComponent,
      id: copyId,
      name: `${selectedComponent.name} copy`,
      region: selectedComponentRegion ?? getComponentRegion(selectedComponent, template),
      x: snapCoord(selectedComponent.x + 16),
      y: snapCoord(selectedComponent.y + 16),
    } as BuilderComponent, template, undefined, {
      avoidCollisions: true,
      excludeComponentId: copyId,
    });

    pushHistory();
    setTemplate((current) => ({ ...current, components: [...current.components, copy] }));
    setSelectedId(copy.id);
    setEditingSavedComponentSource(null);
  };

  const saveSelectedComponent = async () => {
    if (!selectedComponent) {
      showWarning('Select a component before saving it.');
      return;
    }

    try {
      setIsSavingComponent(true);
      const componentToSave = {
        ...selectedComponent,
        region: getComponentRegion(selectedComponent, template),
      } as BuilderComponent;
      const existingByName = savedComponents.find((component) => (
        normalizeSavedEntityName(component.name) === normalizeSavedEntityName(selectedComponent.name)
      ));
      const updateTargetId = isEditingSelectedSavedComponent && editingSavedComponentSource != null
        ? editingSavedComponentSource.savedComponentId
        : existingByName?.id;
      const savedComponent = updateTargetId == null
        ? await shoppingListBuilderService.createSavedComponent(selectedComponent.name, componentToSave)
        : await shoppingListBuilderService.updateSavedComponent(
          updateTargetId,
          selectedComponent.name,
          componentToSave,
        );
      setSavedComponents((current) => [
        savedComponent,
        ...current.filter((component) => component.id !== savedComponent.id),
      ]);
      setEditingSavedComponentSource({
        savedComponentId: savedComponent.id,
        canvasComponentId: selectedComponent.id,
      });
      showSuccess(
        updateTargetId == null
          ? 'Component saved. It is available in Saved Components.'
          : 'Saved component updated. Future inserts will use the new version.',
      );
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderSaveComponent');
    } finally {
      setIsSavingComponent(false);
    }
  };

  const saveCurrentTemplate = async () => {
    try {
      setIsSavingTemplate(true);
      const refreshedTemplate = await shoppingListBuilderService.refreshTemplateInventory(template);
      const savedTemplateName = limitTemplateName(refreshedTemplate.name.trim());
      const templateToSave = annotateTemplateComponentRegions({
        ...refreshedTemplate,
        name: savedTemplateName,
      });
      const existingByName = savedTemplates.find((currentTemplate) => (
        normalizeSavedEntityName(currentTemplate.name) === normalizeSavedEntityName(savedTemplateName)
      ));
      const updateTargetId = activeSavedTemplateId ?? existingByName?.id;
      const savedTemplate = updateTargetId == null
        ? await shoppingListBuilderService.createSavedTemplate(savedTemplateName, templateToSave)
        : await shoppingListBuilderService.updateSavedTemplate(updateTargetId, savedTemplateName, templateToSave);
      setTemplate(normalizeLegacyBuilderTemplateGeometry(templateToSave));
      setActiveSavedTemplateId(savedTemplate.id);
      setSavedTemplates((current) => [
        savedTemplate,
        ...current.filter((currentTemplate) => currentTemplate.id !== savedTemplate.id),
      ]);
      showSuccess(
        updateTargetId == null
          ? 'Page template saved. It is available in Saved Templates.'
          : 'Page template updated. Saved Templates now use this version.',
      );
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderSaveTemplate');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const applySavedTemplate = async (savedTemplate: SavedBuilderTemplate) => {
    try {
      const refreshedTemplate = await shoppingListBuilderService.refreshTemplateInventory(savedTemplate.templateData);
      const templateToApply = normalizeLegacyBuilderTemplateGeometry(annotateTemplateComponentRegions({
        ...refreshedTemplate,
        name: limitTemplateName(refreshedTemplate.name),
      }));
      pushHistory();
      setTemplate(templateToApply);
      setSelectedId(templateToApply.components[0]?.id ?? '');
      setActiveSavedTemplateId(savedTemplate.id);
      setEditingSavedComponentSource(null);
      showSuccess(`${savedTemplate.name} applied to the canvas with current inventory.`);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderApplyTemplate');
    }
  };

  const insertSavedComponent = (
    savedComponent: SavedBuilderComponent,
    x?: number,
    y?: number,
    options: { editSource?: boolean } = {},
  ) => {
    const placementRegion = x != null && y != null
      ? getRegionForPoint(snapCoord(y), template)
      : getComponentRegion(savedComponent.componentData, template);
    const shouldCenterClickInsertedBodyComponent = (
      x == null
      && y == null
      && placementRegion === 'body'
    );
    const placementX = shouldCenterClickInsertedBodyComponent
      ? getClickInsertXForBodyComponent(savedComponent.componentData.width)
      : x ?? 48;
    const component = clampComponentToTemplateRegion(cloneComponentForCanvas(
      {
        ...savedComponent.componentData,
        x: snapCoord(placementX),
        y: snapCoord(y ?? getTemplateRegionBounds(template, placementRegion).top + gridSize),
        region: placementRegion,
      },
      template.paper.width,
      template.paper.height,
    ), template, placementRegion, {
      avoidCollisions: true,
      excludeComponentId: savedComponent.componentData.id,
    });

    pushHistory();
    setTemplate((current) => ({
      ...current,
      components: [...current.components, component],
    }));
    setSelectedId(component.id);
    setEditingSavedComponentSource(options.editSource
      ? { savedComponentId: savedComponent.id, canvasComponentId: component.id }
      : null);
    showSuccess(
      options.editSource
        ? `${savedComponent.name} added for editing. Save it when your changes are ready.`
        : `${savedComponent.name} added to the canvas.`,
    );
  };

  const insertInventorySection = (inventorySection: InventorySectionComponent, x?: number, y?: number) => {
    const placementRegion: BuilderComponentRegion = 'body';
    // In Guided mode the planner ignores component.x/y for flowing tables and
    // derives positions from the user's add sequence (template.components order).
    // The placeholder Y here is just so the component has valid initial state if
    // it's later flipped to Freeform; the planner overwrites it on every render.
    // In Freeform mode, fall back to a cascading offset so manually-placed
    // tables stagger rather than stacking on top of each other.
    const isGuided = getTemplateLayoutMode(template) === 'guided';
    const bodyTop = getTemplateRegionBounds(template, 'body').top;
    const placementY = y ?? (isGuided
      ? bodyTop
      : Math.max(48 + (template.components.length % 6) * 24, bodyTop));
    const component = clampComponentToTemplateRegion(cloneComponentForCanvas(
      {
        ...inventorySection.component,
        x: snapCoord(x ?? 48),
        y: snapCoord(placementY),
        region: placementRegion,
        flowMode: 'flowing',
        repeatHeaderRows: true,
        keepHeaderWithFirstRow: true,
        keepRowsTogether: true,
      },
      template.paper.width,
      template.paper.height,
    ), template, placementRegion, {
      avoidCollisions: !isGuided,
      excludeComponentId: inventorySection.component.id,
    });

    pushHistory();
    setTemplate((current) => ({
      ...current,
      components: [...current.components, component],
    }));
    setSelectedId(component.id);
    setEditingSavedComponentSource(null);
    showSuccess(`${inventorySection.categoryName} inventory table added to the canvas.`);
  };

  const resetTemplate = () => {
    const nextTemplate = normalizeLegacyBuilderTemplateGeometry(createDefaultBuilderTemplate());
    pushHistory();
    setTemplate(nextTemplate);
    setSelectedId('');
    setActiveSavedTemplateId(null);
    setEditingSavedComponentSource(null);
  };

  const openRenameSavedComponent = (savedComponent: SavedBuilderComponent) => {
    window.setTimeout(() => {
      setRenameSavedComponent(savedComponent);
      setRenameSavedComponentName(savedComponent.name);
    }, DROPDOWN_TO_DIALOG_OPEN_DELAY_MS);
  };

  const openDeleteSavedComponent = (savedComponent: SavedBuilderComponent) => {
    window.setTimeout(() => {
      setComponentPendingDelete(savedComponent);
    }, DROPDOWN_TO_DIALOG_OPEN_DELAY_MS);
  };

  const confirmRenameSavedComponent = async () => {
    if (!renameSavedComponent) return;

    try {
      const updated = await shoppingListBuilderService.updateSavedComponent(
        renameSavedComponent.id,
        renameSavedComponentName,
        renameSavedComponent.componentData,
      );
      setSavedComponents((current) => current.map((component) => (
        component.id === updated.id ? updated : component
      )));
      setRenameSavedComponent(null);
      setRenameSavedComponentName('');
      showSuccess('Saved component renamed.');
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderRenameComponent');
    }
  };

  const confirmDeleteSavedComponent = async () => {
    const savedComponent = componentPendingDelete;
    if (!savedComponent) return;

    try {
      setIsDeletingSavedComponent(true);
      await shoppingListBuilderService.deleteSavedComponent(savedComponent.id);
      setSavedComponents((current) => current.filter((component) => component.id !== savedComponent.id));
      if (editingSavedComponentSource?.savedComponentId === savedComponent.id) {
        setEditingSavedComponentSource(null);
      }
      setComponentPendingDelete(null);
      showSuccess('Saved component deleted.');
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderDeleteComponent');
    } finally {
      setIsDeletingSavedComponent(false);
    }
  };

  const editSavedComponent = (savedComponent: SavedBuilderComponent) => {
    if (
      getComponentRegion(savedComponent.componentData, template) === 'body'
    ) {
      insertSavedComponent(savedComponent, undefined, undefined, { editSource: true });
      return;
    }

    insertSavedComponent(savedComponent, 48, 48, { editSource: true });
  };

  const updateInventoryRowLimit = async (row: SectionTableRow, nextLimit: string) => {
    if (!selectedComponent || selectedComponent.type !== 'section-table' || !row.foodItemId) {
      return;
    }

    try {
      const response = await shoppingListBuilderService.updateInventoryItemLimit(
        row.foodItemId,
        nextLimit.trim() === '' ? null : nextLimit.trim(),
      );
      updateComponent(
        selectedComponent.id,
        (component) => {
          if (component.type !== 'section-table') {
            return component;
          }

          return {
            ...component,
            rows: component.rows.map((currentRow) => (
              currentRow.id === row.id
                ? {
                  ...currentRow,
                  limit: response.foodItem.effectiveLimit,
                  limitSource: response.foodItem.limitSource,
                }
                : currentRow
            )),
          };
        },
        { recordHistory: false },
      );
      await loadInventorySections();
      showSuccess('Inventory limit updated. Templates will use the current item limit.');
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderUpdateInventoryLimit');
    }
  };

  const refreshTemplateInventoryFromServer = useCallback(async () => {
    try {
      const refreshed = await shoppingListBuilderService.refreshTemplateInventory(template);
      setTemplate(normalizeLegacyBuilderTemplateGeometry(annotateTemplateComponentRegions(refreshed)));
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderRefreshInventory');
    }
  }, [template]);

  const removeInventoryRowFromTemplate = useCallback((foodItemId: number) => {
    setTemplate((current) => ({
      ...current,
      components: current.components.map((component) => {
        if (component.type !== 'section-table' || !component.inventorySource) return component;
        return {
          ...component,
          rows: component.rows.filter((row) => row.foodItemId !== foodItemId),
        };
      }),
    }));
  }, []);

  const findFoodItemForRow = useCallback((row: SectionTableRow): FoodItem | null => {
    if (!row.foodItemId) return null;
    return foodItems.find((item) => item.id === row.foodItemId) ?? null;
  }, [foodItems]);

  const handleEditInventoryRow = (row: SectionTableRow) => {
    const item = findFoodItemForRow(row);
    if (!item) {
      showWarning('Food item details are still loading. Try again in a moment.');
      void refreshFoodItems();
      return;
    }
    // Defer the dialog open so the dropdown menu's auto-close completes first.
    // Without this, both menu and dialog hold their focus traps simultaneously
    // and the body stays in `pointer-events: none` after either closes.
    window.setTimeout(() => setEditingFoodItem(item), DROPDOWN_TO_DIALOG_OPEN_DELAY_MS);
  };

  const updateFoodItemStatus = async (
    item: FoodItem,
    nextFlags: StatusFlags,
    successMessage: string,
    supplyUpdate?: FoodItemSupply,
  ) => {
    try {
      await updateFoodItem({
        id: item.id,
        name: item.name,
        limit: item.limit,
        limitType: item.limitType,
        categoryId: item.categoryId,
        statusFlags: nextFlags,
        dietaryFlags: item.dietaryFlags,
        supplyUpdate,
      });
      if (!nextFlags.isInStock) {
        removeInventoryRowFromTemplate(item.id);
      }
      await Promise.all([refreshFoodItems(), loadInventorySections(), refreshTemplateInventoryFromServer()]);
      showSuccess(successMessage);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderUpdateInventoryStatus');
    }
  };

  const handleMarkOutOfStock = (row: SectionTableRow) => {
    const item = findFoodItemForRow(row);
    if (!item) {
      showWarning('Food item details are still loading. Try again in a moment.');
      void refreshFoodItems();
      return;
    }
    void updateFoodItemStatus(
      item,
      { isInStock: false, isLimited: false, isClearance: false },
      `${item.name} marked out of stock.`,
    );
  };

  const handleMarkClearance = (row: SectionTableRow) => {
    const item = findFoodItemForRow(row);
    if (!item) {
      showWarning('Food item details are still loading. Try again in a moment.');
      void refreshFoodItems();
      return;
    }
    void updateFoodItemStatus(
      item,
      { ...item.statusFlags, isClearance: !item.statusFlags.isClearance },
      item.statusFlags.isClearance
        ? `${item.name} cleared from clearance.`
        : `${item.name} marked clearance.`,
    );
  };

  const handleOpenChangeCategory = (row: SectionTableRow) => {
    const item = findFoodItemForRow(row);
    if (!item) {
      showWarning('Food item details are still loading. Try again in a moment.');
      void refreshFoodItems();
      return;
    }
    window.setTimeout(() => {
      setChangeCategoryItem(item);
      setChangeCategoryTargetId(String(item.categoryId));
    }, DROPDOWN_TO_DIALOG_OPEN_DELAY_MS);
  };

  const confirmChangeCategory = async () => {
    if (!changeCategoryItem) return;
    const targetId = Number(changeCategoryTargetId);
    if (!Number.isInteger(targetId) || targetId === changeCategoryItem.categoryId) {
      setChangeCategoryItem(null);
      return;
    }

    try {
      setIsChangingCategory(true);
      await updateFoodItem({
        id: changeCategoryItem.id,
        name: changeCategoryItem.name,
        limit: changeCategoryItem.limit,
        limitType: changeCategoryItem.limitType,
        categoryId: targetId,
        statusFlags: changeCategoryItem.statusFlags,
        dietaryFlags: changeCategoryItem.dietaryFlags,
      });
      removeInventoryRowFromTemplate(changeCategoryItem.id);
      await Promise.all([refreshFoodItems(), loadInventorySections(), refreshTemplateInventoryFromServer()]);
      showSuccess(`${changeCategoryItem.name} moved to a new category.`);
      setChangeCategoryItem(null);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderChangeCategory');
    } finally {
      setIsChangingCategory(false);
    }
  };

  const handleOpenDeleteFoodItem = (row: SectionTableRow) => {
    const item = findFoodItemForRow(row);
    if (!item) {
      showWarning('Food item details are still loading. Try again in a moment.');
      void refreshFoodItems();
      return;
    }
    window.setTimeout(() => setFoodItemPendingDelete(item), DROPDOWN_TO_DIALOG_OPEN_DELAY_MS);
  };

  const confirmDeleteFoodItem = async () => {
    if (!foodItemPendingDelete) return;
    const target = foodItemPendingDelete;
    try {
      setIsDeletingFoodItem(true);
      await deleteFoodItem(target.id);
      removeInventoryRowFromTemplate(target.id);
      await Promise.all([refreshFoodItems(), loadInventorySections(), refreshTemplateInventoryFromServer()]);
      showSuccess(`${target.name} deleted from inventory.`);
      setFoodItemPendingDelete(null);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderDeleteFoodItem');
    } finally {
      setIsDeletingFoodItem(false);
    }
  };

  const handleSaveEditedFoodItem = async (
    update: Partial<FoodItem> & { keepTranslations?: boolean },
  ) => {
    if (!editingFoodItem) return;
    try {
      await updateFoodItem({
        id: editingFoodItem.id,
        name: update.name ?? editingFoodItem.name,
        limit: update.limit ?? editingFoodItem.limit,
        limitType: update.limitType ?? editingFoodItem.limitType,
        categoryId: update.categoryId ?? editingFoodItem.categoryId,
        statusFlags: update.statusFlags ?? editingFoodItem.statusFlags,
        dietaryFlags: update.dietaryFlags ?? editingFoodItem.dietaryFlags,
        supplyUpdate: update.supply,
        fulfilmentUpdate: update.fulfilment,
        keepTranslations: update.keepTranslations,
      });
      await Promise.all([refreshFoodItems(), loadInventorySections(), refreshTemplateInventoryFromServer()]);
      setEditingFoodItem(null);
      showSuccess('Food item updated.');
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderEditFoodItem');
    }
  };

  const handleCreateFoodItem = async (data: {
    name: string;
    limit: number;
    limitType: 'person' | 'household';
    categoryId: number;
    statusFlags: StatusFlags;
    dietaryFlags: DietaryFlags;
    supply?: FoodItemSupply;
    fulfilment?: FoodItem['fulfilment'];
  }) => {
    try {
      await createFoodItem({ ...data, supplyUpdate: data.supply, fulfilmentUpdate: data.fulfilment });
      await Promise.all([refreshFoodItems(), loadInventorySections(), refreshTemplateInventoryFromServer()]);
      showSuccess(`${data.name} added to inventory.`);
      return true;
    } catch (error) {
      // Duplicate-name conflicts get a "Mark In Stock" toast action; on
      // success the builder's inventory sections + canvas are refreshed so
      // the (formerly out-of-stock) item becomes available. Every other
      // error is already toasted by the shared food-item data hook, so this
      // catch only needs the duplicate-name notifier.
      notifyFoodItemCreateError(error, {
        onMarkedInStock: () => Promise.all([
          refreshFoodItems(),
          loadInventorySections(),
          refreshTemplateInventoryFromServer(),
        ]),
      });
      return false;
    }
  };

  const handleAddOutOfStockItem = async (item: FoodItem) => {
    try {
      await updateFoodItem({
        id: item.id,
        name: item.name,
        limit: item.limit,
        limitType: item.limitType,
        categoryId: item.categoryId,
        statusFlags: { ...item.statusFlags, isInStock: true },
        dietaryFlags: item.dietaryFlags,
      });
      await Promise.all([refreshFoodItems(), loadInventorySections(), refreshTemplateInventoryFromServer()]);
      showSuccess(`${item.name} marked back in stock.`);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderRestockFoodItem');
    }
  };

  const handleSaveCategoryEdit = async (
    update: Partial<Category> & { keepTranslations?: boolean },
  ) => {
    if (editingCategoryId == null) return;
    const existing = categories.find((category) => category.id === editingCategoryId);
    if (!existing) return;
    try {
      await updateCategory({
        id: existing.id,
        name: update.name ?? existing.name,
        limit: update.limit ?? existing.limit,
        limitType: update.limitType ?? existing.limitType,
        icon: update.icon ?? existing.icon,
        keepTranslations: update.keepTranslations,
      });
      await Promise.all([loadInventorySections(), refreshTemplateInventoryFromServer()]);
      setEditingCategoryId(null);
      showSuccess('Category updated.');
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderUpdateCategory');
    }
  };

  const outOfStockItemsForCategory = useMemo(() => {
    if (!selectedComponent || selectedComponent.type !== 'section-table' || !selectedComponent.inventorySource) {
      return [] as FoodItem[];
    }
    return foodItems
      .filter((item) => item.categoryId === selectedComponent.inventorySource?.categoryId && !item.statusFlags.isInStock)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [foodItems, selectedComponent]);

  const editingCategory = useMemo(() => (
    editingCategoryId == null
      ? null
      : categories.find((category) => category.id === editingCategoryId) ?? null
  ), [categories, editingCategoryId]);

  const handlePaletteDragStart = (event: React.DragEvent<HTMLButtonElement>, type: BuilderComponentType) => {
    setBuilderDragData(event, BUILDER_COMPONENT_DRAG_TYPE, type, componentTypeLabel(type));
  };

  const handleSavedComponentDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
    savedComponent: SavedBuilderComponent,
  ) => {
    setBuilderDragData(
      event,
      SAVED_COMPONENT_DRAG_TYPE,
      String(savedComponent.id),
      savedComponent.name,
    );
  };

  const handleInventorySectionDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
    inventorySection: InventorySectionComponent,
  ) => {
    setBuilderDragData(
      event,
      INVENTORY_SECTION_DRAG_TYPE,
      String(inventorySection.categoryId),
      inventorySection.categoryName,
    );
  };

  // When Guided + Split body is active and the user drops a component into the
  // body region, snap the dropped object's X so it sits centered inside the
  // page half the pointer landed in. We center across the visible page-half
  // span (page edge <-> center line) rather than the narrower lane bounds
  // (which exclude a 9pt buffer to the center line) so the resulting margins
  // are visually balanced against the page edge and the center divider.
  // The collision/clamp logic later in the insert helpers still keeps the
  // object inside the lane proper.
  const centerDroppedXInBodyLane = (pointerX: number, pointerY: number, objectWidth: number): number => {
    if (layoutMode !== 'guided' || bodyLayoutMode !== 'split') {
      return snapCoord(pointerX);
    }
    if (getRegionForPoint(pointerY, template) !== 'body') {
      return snapCoord(pointerX);
    }
    const center = template.paper.width / 2;
    return getCenteredXInBodyHalf(
      template.paper.width,
      objectWidth,
      pointerX >= center ? 'right' : 'left',
      gridSize,
    );
  };

  // Resize the canvas zoom so the page width fills the visible canvas area.
  // The Radix ScrollArea root contains a `[data-radix-scroll-area-viewport]`
  // child; we use the viewport's clientWidth so the calculation matches what
  // the user actually sees (excluding scroll-bar gutters).
  const fitPageToWidth = useCallback(() => {
    const root = canvasScrollRef.current;
    if (!root) return;
    const viewport = root.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    const containerWidth = (viewport ?? root).clientWidth;
    if (!Number.isFinite(containerWidth) || containerWidth <= 0) return;
    // Leave a 24pt visual breathing margin (matches `mx-auto my-6` rhythm) so
    // the page edges don't collide with the canvas border.
    const targetScale = Math.max(0.1, (containerWidth - 24) / template.paper.width);
    const targetZoom = Math.round((targetScale * 100) / CANVAS_ZOOM_SCALE_FACTOR / CANVAS_ZOOM_STEP)
      * CANVAS_ZOOM_STEP;
    setZoom(clamp(targetZoom, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM));
  }, [template.paper.width]);

  const handlePaperDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!paperRef.current) return;

    const bounds = paperRef.current.getBoundingClientRect();
    const scale = getCanvasScale(zoom);
    const pointerX = Math.round((event.clientX - bounds.left) / scale);
    const pointerY = Math.round((event.clientY - bounds.top) / scale);
    const y = snapCoord(pointerY);

    const type = getBuilderDragData(event, BUILDER_COMPONENT_DRAG_TYPE) as BuilderComponentType;
    if (type) {
      const dropX = centerDroppedXInBodyLane(pointerX, pointerY, DEFAULT_BUILDER_COMPONENT_WIDTH);
      addComponent(type, dropX, y);
      return;
    }

    const savedComponentValue = getBuilderDragData(event, SAVED_COMPONENT_DRAG_TYPE);
    if (savedComponentValue) {
      const savedComponentId = Number(savedComponentValue);
      const savedComponent = savedComponents.find((component) => component.id === savedComponentId);
      if (savedComponent) {
        const dropX = centerDroppedXInBodyLane(pointerX, pointerY, savedComponent.componentData.width);
        insertSavedComponent(savedComponent, dropX, y);
      }
      return;
    }

    const inventorySectionValue = getBuilderDragData(event, INVENTORY_SECTION_DRAG_TYPE);
    if (inventorySectionValue) {
      const categoryId = Number(inventorySectionValue);
      // Only react if the section is still in the scroll-area pool. A category
      // that's already on the canvas is filtered out of `availableInventorySections`,
      // and a stale drag from a now-placed section would otherwise duplicate it.
      const inventorySection = availableInventorySections.find((section) => section.categoryId === categoryId);
      if (inventorySection) {
        const dropX = centerDroppedXInBodyLane(pointerX, pointerY, inventorySection.component.width);
        insertInventorySection(inventorySection, dropX, y);
      }
    }
  };

  // Any body component handled by the Guided planner — flowing tables AND
  // single-placement components (text, fixed tables, form fields, lines,
  // dates, saved). Drag gestures on these reorder their sequence position
  // instead of moving x/y.
  const isGuidedPlannedBodyComponent = (component: BuilderComponent) => (
    layoutMode === 'guided' && flowingTablePlan.plannedBodyComponentIds.has(component.id)
  );

  // Convert a pointer event into paper-local coordinates by walking up to the
  // nearest .shopping-list-print-page element. Returns null if the pointer is
  // not currently over a rendered page (e.g. the gesture left the canvas).
  const pointerToPaperCoords = (event: React.PointerEvent): { pageIndex: number; x: number; y: number } | null => {
    const pageEl = (event.target as HTMLElement | null)?.closest('.shopping-list-print-page') as HTMLElement | null;
    let resolvedPageEl: HTMLElement | null = pageEl;
    if (!resolvedPageEl) {
      // Fallback: hit-test all rendered pages by viewport rect.
      const pages = document.querySelectorAll<HTMLElement>('.shopping-list-print-page');
      for (const candidate of Array.from(pages)) {
        const rect = candidate.getBoundingClientRect();
        if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
          resolvedPageEl = candidate;
          break;
        }
      }
    }
    if (!resolvedPageEl) return null;
    const pageIndexAttr = resolvedPageEl.getAttribute('data-page-index');
    const pageIndex = pageIndexAttr != null ? Number(pageIndexAttr) : 0;
    const rect = resolvedPageEl.getBoundingClientRect();
    const scale = getCanvasScale(zoom);
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;
    return { pageIndex, x, y };
  };

  const handleComponentPointerDown = (event: React.PointerEvent<HTMLDivElement>, component: BuilderComponent) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(component.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (isGuidedPlannedBodyComponent(component)) {
      reorderRef.current = {
        componentId: component.id,
        pointerId: event.pointerId,
      };
      setReorderState({ componentId: component.id, target: null });
      return;
    }
    dragRef.current = {
      id: component.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originalX: component.x,
      originalY: component.y,
      hasMoved: false,
    };
  };

  const handleComponentPointerMove = (event: React.PointerEvent<HTMLDivElement>, component: BuilderComponent) => {
    const reorder = reorderRef.current;
    if (reorder && reorder.componentId === component.id) {
      const cursor = pointerToPaperCoords(event);
      if (!cursor) {
        setReorderState((prev) => (prev ? { ...prev, target: null } : prev));
        return;
      }
      const targets = computeGuidedInsertTargets(template, flowingTablePlan, component.id);
      // Tolerance: ~3 grid cells (27pt) so the line snaps when the pointer is
      // anywhere near a valid gap, but disappears in dead zones.
      const tolerance = gridSize * 3;
      const target = findNearestInsertTarget(targets, template.paper.height, cursor, tolerance, gridSize * 12);
      setReorderState((prev) => (prev ? { ...prev, target } : prev));
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.id !== component.id) return;

    const scale = getCanvasScale(zoom);
    if (!drag.hasMoved) {
      pushHistory();
      drag.hasMoved = true;
    }
    const displayHeight = getCanvasComponentHeight(component);
    const nextX = clamp(snapCoord(Math.round(drag.originalX + (event.clientX - drag.startX) / scale)), 0, template.paper.width - component.width);
    const nextY = clamp(snapCoord(Math.round(drag.originalY + (event.clientY - drag.startY) / scale)), 0, template.paper.height - displayHeight);

    updateComponent(
      component.id,
      (current) => ({ ...current, x: nextX, y: nextY }) as BuilderComponent,
      { recordHistory: false },
    );
  };

  const handleComponentPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const reorder = reorderRef.current;
    if (reorder && reorder.pointerId === event.pointerId) {
      const finalState = reorderState;
      reorderRef.current = null;
      setReorderState(null);
      if (finalState && finalState.target) {
        const draggedId = reorder.componentId;
        const targetIndex = finalState.target.sequenceIndex;
        pushHistory();
        setTemplate((current) => {
          const remaining = current.components.filter((c) => c.id !== draggedId);
          const dragged = current.components.find((c) => c.id === draggedId);
          if (!dragged) return current;
          const clampedIndex = Math.max(0, Math.min(targetIndex, remaining.length));
          const nextComponents = [
            ...remaining.slice(0, clampedIndex),
            dragged,
            ...remaining.slice(clampedIndex),
          ];
          return { ...current, components: nextComponents };
        });
      }
      return;
    }
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const downloadPreviewPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      const refreshedTemplate = await shoppingListBuilderService.refreshTemplateInventory(template);
      const printableTemplate = annotateTemplateComponentRegions(refreshedTemplate);
      setTemplate(normalizeLegacyBuilderTemplateGeometry(printableTemplate));
      // When the user has a non-English Preview language active in the
      // action bar, download a print-ready PDF in that language. The
      // backend already accepts `targetLanguage` and uses cached text-
      // component translations + denormalized CategoryTranslation /
      // FoodItemTranslation rows; missing translations silently fall
      // back to English (same contract the canvas preview uses).
      const activeTargetLanguage = previewLanguage.trim();
      const pdf = await shoppingListBuilderService.createPreviewPdf(
        printableTemplate,
        activeTargetLanguage ? { targetLanguage: activeTargetLanguage } : {},
      );
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      // Encode the language into the filename so multiple downloads in
      // different languages don't collide in the user's downloads folder.
      const filenameLanguageSegment = activeTargetLanguage
        ? `-${activeTargetLanguage.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}`
        : '';
      link.download = `shopping-list-builder-preview${filenameLanguageSegment}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showSuccess(
        activeTargetLanguage
          ? `PDF preview downloaded in ${activeTargetLanguage}. Open it to compare the page with the canvas.`
          : 'PDF preview downloaded. Open it to compare the page with the canvas.',
      );
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderPreviewPdf');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const renderCanvasComponent = (
    component: BuilderComponent,
    options: {
      key: React.Key;
      left?: number;
      top?: number;
      height?: number;
      rows?: SectionTableRow[];
      rowHeights?: number[];
      isDraggable?: boolean;
      showRegionBadge?: boolean;
      isContinuation?: boolean;
    },
  ) => {
    const selected = component.id === selectedId;
    const displayHeight = options.height ?? getCanvasComponentHeight(component, sectionTableMeasurement);
    const componentRegion = getComponentRegion(component, template);
    const isDraggable = options.isDraggable ?? true;
    const showRegionBadge = selected && (options.showRegionBadge ?? true);
    const isReorderingThis = reorderState?.componentId === component.id;
    const canChangeRegion = !isInventorySectionTable(component);

    return (
      <div
        key={options.key}
        className={cn(
          'absolute select-none rounded-[2px] outline-hidden',
          selected ? 'z-20' : 'z-10 hover:ring-1 hover:ring-primary/40',
        )}
        data-region={componentRegion}
        data-flow-continuation={options.isContinuation ? 'true' : undefined}
        style={{
          left: options.left ?? component.x,
          top: options.top ?? component.y,
          width: component.width,
          height: displayHeight,
          cursor: isDraggable ? 'move' : 'pointer',
          opacity: isReorderingThis ? 0.4 : undefined,
        }}
        onPointerDown={isDraggable
          ? (event) => handleComponentPointerDown(event, component)
          : (event) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedId(component.id);
          }}
        onPointerMove={isDraggable ? (event) => handleComponentPointerMove(event, component) : undefined}
        onPointerUp={isDraggable ? handleComponentPointerUp : undefined}
        onPointerCancel={isDraggable ? handleComponentPointerUp : undefined}
        role="button"
        tabIndex={0}
        aria-label={`Select ${component.name}`}
      >
        {selected && (
          <div className="pointer-events-none absolute inset-[-3px] z-30 rounded-[4px] border-2 border-primary" />
        )}
        {showRegionBadge && (
          <div
            className="pointer-events-auto absolute -top-8 left-0 z-40 flex items-center gap-1"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {canChangeRegion && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="builder-component-region-trigger"
                    className={cn(
                      'h-6 gap-1 rounded-full px-2 text-[11px]',
                      componentRegionBadgeClass(componentRegion),
                    )}
                  >
                    {componentRegionLabel(componentRegion)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Page Region</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {BUILDER_COMPONENT_REGIONS.map((region) => (
                    <DropdownMenuItem
                      key={region}
                      disabled={!canPlaceComponentInRegion(component, template, region)}
                      onSelect={() => changeComponentRegion(component.id, region)}
                    >
                      <span className="flex flex-col">
                        <span>{componentRegionLabel(region)}</span>
                        <span className="text-xs text-muted-foreground">
                          {componentRegionDescription(region)}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {(componentRegion === 'header' || componentRegion === 'footer') && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="builder-component-repeat-mode-trigger"
                    className={cn(
                      'h-6 gap-1 rounded-full px-2 text-[11px]',
                      componentRegionBadgeClass(componentRegion),
                    )}
                  >
                    {headerFooterRepeatModeShortLabel(component.repeatMode ?? 'every')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Repeat on pages</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {BUILDER_HEADER_FOOTER_REPEAT_MODES.map((mode) => (
                    <DropdownMenuItem
                      key={mode}
                      data-testid={`builder-component-repeat-mode-${mode}`}
                      onSelect={() => changeComponentRepeatMode(component.id, mode)}
                    >
                      <span className="flex flex-col">
                        <span>{headerFooterRepeatModeLabel(mode)}</span>
                        <span className="text-xs text-muted-foreground">
                          {headerFooterRepeatModeDescription(mode)}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
        <div className="relative z-10 h-full w-full">
          {component.type === 'section-table' && options.rows
            ? <PreviewSectionTable component={component} rows={options.rows} rowHeights={options.rowHeights} includeCategoryIcons={includeCategoryIcons} />
            : <PreviewComponent component={component} includeCategoryIcons={includeCategoryIcons} />}
        </div>
      </div>
    );
  };

  return (
    // Provide canvas-wide preview-language state to every translation-aware
    // child (PreviewText today; PreviewSectionTable / PreviewFormFields in
    // future slices). When `language === ''` the canvas renders English;
    // otherwise each text component renders per its own translationMode
    // against the fetched `translations` map.
    <PreviewLanguageContext.Provider
      value={{
        language: previewLanguage,
        translations: previewTranslations,
        inventoryTranslations: previewInventoryTranslations,
        globalLimit,
      }}
    >
      <TooltipProvider>
        <div className="space-y-4 pt-6" data-testid="shopping-list-builder">
        <div className="flex flex-col gap-4">
          <SectionHeader
            title="Shopping List Builder"
            description={terminology.format('Compose printable shopping list templates from constrained {pantry} components')}
            icon={ShoppingListBuilderTitleIcon}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AnimateIcon asChild animate={animateBuilderChromeMount} animateOnHover animateOnTap>
                <Button size="sm" onClick={downloadPreviewPdf} disabled={isGeneratingPdf}>
                  <DownloadIcon size={16} />
                  {isGeneratingPdf ? 'Preparing PDF' : 'Download PDF'}
                </Button>
              </AnimateIcon>
              <AnimateIcon asChild animate={animateBuilderChromeMount} animateOnHover animateOnTap>
                <Button variant="outline" size="sm" onClick={saveCurrentTemplate} disabled={isSavingTemplate}>
                  {isSavingTemplate ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SaveIcon size={16} />
                  )}
                  Save Template
                </Button>
              </AnimateIcon>
            </div>
            <div className="flex items-center gap-2">
              {/*
                Canvas-wide translation preview. Picking a language re-renders
                every translation-aware component (slice 2 = text components
                only) per its own `translationMode`. "English (no preview)"
                reverts the canvas immediately and skips any network call.
                State + fetch effect live in the parent ShoppingListBuilder;
                this Select is just the trigger.
              */}
              <Select
                value={previewLanguage || PREVIEW_LANGUAGE_NONE_SENTINEL}
                onValueChange={(value) => {
                  setPreviewLanguage(value === PREVIEW_LANGUAGE_NONE_SENTINEL ? '' : value);
                }}
                disabled={isLoadingLanguages}
              >
                <SelectTrigger
                  className="h-9 w-[180px]"
                  aria-label="Preview language"
                  data-testid="builder-preview-language-select"
                >
                  {/*
                    `flex!` overrides the SelectTrigger's `[&>span]:line-clamp-1`
                    utility, which forces display: -webkit-box + vertical
                    box-orient and stacks the Languages icon above the
                    SelectValue text. With display:flex restored, the icon
                    and the value sit side-by-side as intended.
                  */}
                  <span className="flex! items-center gap-2 truncate">
                    <AnimateIcon asChild animate={animateBuilderChromeMount} animateOnHover animateOnTap>
                      <LanguagesIcon size={16} className="shrink-0" />
                    </AnimateIcon>
                    <SelectValue placeholder="Preview language" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PREVIEW_LANGUAGE_NONE_SENTINEL}>English (no preview)</SelectItem>
                  {enabledNonEnglishLanguages.map((lang) => (
                    <SelectItem key={lang.name} value={lang.name}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AnimateIcon asChild animate={animateBuilderChromeMount} animateOnHover animateOnTap>
                <Button variant="outline" size="sm" onClick={resetTemplate}>
                  <RotateCcwIcon size={16} />
                  Reset
                </Button>
              </AnimateIcon>
            </div>
          </div>
        </div>

        <div
          className="grid gap-4 lg:h-[calc(100vh-184px)] lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[320px_minmax(0,1fr)_320px]"
          data-testid="builder-workspace-grid"
        >
          <aside className="flex flex-col rounded-md border bg-card p-3 lg:col-span-2 xl:col-span-1">
            <div className="mb-4 space-y-4">
              <div className="space-y-2">
                <BuilderSectionLabel
                  htmlFor="builder-template-name"
                  icon={{ type: 'animate', icon: ClipboardCheckIcon }}
                >
                  Template Name
                </BuilderSectionLabel>
                <Input
                  id="builder-template-name"
                  value={template.name}
                  maxLength={MAX_SAVED_TEMPLATE_NAME_LENGTH}
                  onChange={(event) =>
                    setTemplate((current) => ({
                      ...current,
                      name: limitTemplateName(event.target.value),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {template.name.length}/{MAX_SAVED_TEMPLATE_NAME_LENGTH} characters
                </p>
              </div>

              <div className="space-y-2">
                <BuilderSectionLabel
                  htmlFor="builder-apply-saved-template"
                  icon={{ type: 'animate', icon: SquareArrowOutUpRightIcon }}
                >
                  Apply Saved Template
                </BuilderSectionLabel>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      id="builder-apply-saved-template"
                      type="button"
                      variant="outline"
                      data-testid="saved-template-apply-trigger"
                      className="w-full justify-start gap-2"
                      disabled={isLoadingSavedTemplates || savedTemplates.length === 0}
                    >
                      <AnimateIcon asChild animateOnHover animateOnTap>
                        <LayoutTemplateIcon size={16} className="shrink-0" />
                      </AnimateIcon>
                      <span className="min-w-0 truncate text-left">
                        {savedTemplates.length > 0 ? 'Choose template to apply' : 'No saved templates'}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-(--radix-dropdown-menu-trigger-width)"
                  >
                    <DropdownMenuLabel>Apply to Canvas</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <ScrollArea
                      data-testid="saved-template-apply-scroll-area"
                      className={cn(savedTemplates.length > 4 ? 'h-[244px] pr-2' : 'max-h-[244px]')}
                    >
                      <div className="space-y-1">
                        {savedTemplates.map((savedTemplate) => (
                          <DropdownMenuItem
                            key={savedTemplate.id}
                            data-testid="saved-template-apply-item"
                            title={savedTemplate.name}
                            className="flex-col items-start gap-0 py-2"
                            onSelect={() => void applySavedTemplate(savedTemplate)}
                          >
                            <span className="w-full text-sm font-medium">
                              {truncateMiddle(savedTemplate.name, MAX_SAVED_TEMPLATE_NAME_LENGTH)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {savedTemplate.templateData.components.length} components
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </div>
                    </ScrollArea>
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-muted-foreground">
                  Select a saved page template to replace the current canvas.
                </p>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <div>
                <BuilderSectionLabel
                  className="text-sm font-semibold"
                  icon={{ type: 'animate', icon: BetweenHorizontalStartIcon }}
                >
                  Base Components
                </BuilderSectionLabel>
                <p className="text-xs text-muted-foreground">Customizable primitives</p>
              </div>
            </div>
            <div className="space-y-2">
              {paletteItems.map((item) => (
                <AnimateIcon key={item.type} asChild animateOnHover animateOnTap>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handlePaletteDragStart(event, item.type)}
                    onClick={() => addComponent(item.type)}
                    className="flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center gap-2">
                      <item.icon size={16} />
                      {item.label}
                    </span>
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </button>
                </AnimateIcon>
              ))}
            </div>

            <Separator className="my-4" />

            <div className="space-y-3">
              <div>
                <BuilderSectionLabel
                  className="text-sm font-semibold"
                  icon={{ type: 'bridged', icon: BoxIcon }}
                >
                  Inventory Sections
                </BuilderSectionLabel>
                <p className="text-xs text-muted-foreground">
                  {availableInventorySections.length} current sections
                  {placedInventoryCategoryIds.size > 0 && (
                    <span> · {placedInventoryCategoryIds.size} on canvas</span>
                  )}
                </p>
              </div>
              {availableInventorySections.length > 0 ? (
                <ScrollArea className={BUILDER_LIST_SCROLL_CLASS}>
                  <div className="space-y-2">
                    {availableInventorySections.map((inventorySection) => (
                      <button
                        key={inventorySection.categoryId}
                        type="button"
                        draggable
                        data-testid="inventory-section-drag-source"
                        data-inventory-section-name={inventorySection.categoryName}
                        onDragStart={(event) => handleInventorySectionDragStart(event, inventorySection)}
                        onClick={() => insertInventorySection(inventorySection)}
                        className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{inventorySection.categoryName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {inventorySection.itemCount} in-stock items
                          </span>
                        </span>
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              ) : inventorySections.length > 0 ? (
                <div
                  data-testid="inventory-sections-all-placed"
                  className="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
                >
                  Every inventory section is on the canvas. Delete one to bring it back here.
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Inventory sections will appear when in-stock food items are available.
                </div>
              )}
            </div>

            <Separator className="my-4" />

            <div className="space-y-3">
              <div>
                <BuilderSectionLabel
                  className="text-sm font-semibold"
                  icon={{ type: 'bridged', icon: ReceiptTextIcon }}
                >
                  Saved Components
                </BuilderSectionLabel>
                <p className="text-xs text-muted-foreground">{savedComponents.length} saved</p>
              </div>
              {savedComponents.length > 0 ? (
                <ScrollArea className={BUILDER_LIST_SCROLL_CLASS}>
                  <div className="space-y-2">
                    {savedComponents.map((savedComponent) => (
                      <div
                        key={savedComponent.id}
                        data-testid="saved-component-card"
                        data-saved-component-name={savedComponent.name}
                        className="flex w-full items-center gap-1 rounded-md border bg-background p-1 text-sm transition-colors hover:bg-accent"
                      >
                        <button
                          type="button"
                          draggable
                          onDragStart={(event) => handleSavedComponentDragStart(event, savedComponent)}
                          onClick={() => insertSavedComponent(savedComponent)}
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{savedComponent.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {componentTypeLabel(savedComponent.componentType)}
                            </span>
                          </span>
                          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                        <SavedComponentActionsMenu
                          savedComponent={savedComponent}
                          onRename={openRenameSavedComponent}
                          onEdit={editSavedComponent}
                          onDelete={openDeleteSavedComponent}
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Saved components will appear here after you save one from the canvas.
                </div>
              )}
            </div>

            <Separator className="my-4" />

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Canvas</span>
                <Badge variant="secondary">Letter</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Zoom</span>
                  <span data-testid="builder-zoom-value">
                    {zoom}%{zoom === CANVAS_DEFAULT_ZOOM ? ' (Full page)' : ''}
                  </span>
                </div>
                <Slider
                  value={[zoom]}
                  min={CANVAS_MIN_ZOOM}
                  max={CANVAS_MAX_ZOOM}
                  step={CANVAS_ZOOM_STEP}
                  onValueChange={([value]) => setZoom(value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="builder-zoom-full-page"
                    onClick={() => setZoom(CANVAS_DEFAULT_ZOOM)}
                    disabled={zoom === CANVAS_DEFAULT_ZOOM}
                  >
                    Full page
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="builder-zoom-page-width"
                    onClick={fitPageToWidth}
                  >
                    Page width
                  </Button>
                </div>
              </div>
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border translation-options-column p-3 lg:h-[calc(150vh-184px)]">
            <div className="mb-3 space-y-2">
              {/* Row 1: layout toggles (left) + canvas actions (right) */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <LayoutModeToggle mode={layoutMode} onChange={setLayoutMode} animateOnMount={animateBuilderChromeMount} />
                  <GridGuidesToggle shown={showCanvasGuides} onChange={setShowCanvasGuides} animateOnMount={animateBuilderChromeMount} />
                </div>
                <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={undoLastChange}
                      disabled={templateHistory.length === 0}
                      aria-label="Undo last canvas change"
                    >
                      <AnimateIcon animate={animateBuilderChromeMount} animateOnHover animateOnTap>
                        <UndoIcon size={16} />
                      </AnimateIcon>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Undo last canvas change</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={duplicateSelectedComponent}
                      aria-label="Duplicate selected component"
                    >
                      <AnimateIcon animate={animateBuilderChromeMount} animateOnHover animateOnTap>
                        <CopyIcon size={16} />
                      </AnimateIcon>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Duplicate selected component</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={deleteSelectedComponent}
                      aria-label="Delete selected component"
                    >
                      <AnimateIcon animate={animateBuilderChromeMount} animateOnHover animateOnTap>
                        <Trash2Icon size={16} />
                      </AnimateIcon>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete selected component</TooltipContent>
                </Tooltip>
                </div>
              </div>
              {/* Row 2: status pills centered */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Badge variant="outline">612 x 792 pt</Badge>
                <Badge variant="outline">{bodyLayoutModeLabel(bodyLayoutMode)}</Badge>
                <Badge variant="outline">Max {maxPages} pages</Badge>
                <Badge variant="outline">{printModeLabel(printMode)}</Badge>
                <Badge variant="outline">{template.components.length} components</Badge>
                {flowingTablePlan.overflowRowCount > 0 && (
                  <Badge variant="destructive" data-testid="builder-flow-overflow-warning">
                    {flowingTablePlan.overflowRowCount} rows exceed max pages
                  </Badge>
                )}
              </div>
            </div>

            <ScrollArea
              ref={canvasScrollRef}
              data-testid="shopping-list-builder-canvas-scroll"
              className="shopping-list-print-workspace min-h-0 flex-1 rounded-md border bg-background"
            >
              <div className="flex min-w-max flex-col items-center py-6">
                {Array.from({ length: flowingTablePlan.pageCount }, (_, pageIndex) => (
                  <div
                    key={pageIndex}
                    className="shopping-list-print-page-frame relative mx-auto mb-6 last:mb-0"
                    style={{
                      width: template.paper.width * getCanvasScale(zoom),
                      height: template.paper.height * getCanvasScale(zoom),
                    }}
                  >
                    <div
                      ref={pageIndex === 0 ? paperRef : undefined}
                      className="shopping-list-print-page print-theme absolute left-0 top-0 origin-top-left"
                      style={{
                        width: template.paper.width,
                        height: template.paper.height,
                        transform: `scale(${getCanvasScale(zoom)})`,
                      }}
                      data-testid={pageIndex === 0 ? 'shopping-list-builder-paper' : 'shopping-list-builder-paper-page'}
                      data-page-index={pageIndex}
                      data-component-count={template.components.length}
                      data-layout-mode={layoutMode}
                      data-body-layout-mode={bodyLayoutMode}
                      data-max-pages={maxPages}
                      data-print-mode={printMode}
                      onDragOver={pageIndex === 0 ? (event) => event.preventDefault() : undefined}
                      onDrop={pageIndex === 0 ? handlePaperDrop : undefined}
                      onPointerDown={() => setSelectedId('')}
                    >
                      {showCanvasGuides && layoutMode === 'guided' && (
                        <div
                          aria-hidden
                          data-testid={pageIndex === 0 ? 'shopping-list-builder-grid' : undefined}
                          className="pointer-events-none absolute inset-0"
                          style={{
                            backgroundImage:
                              'linear-gradient(to right, rgba(15,23,42,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.18) 1px, transparent 1px), linear-gradient(to right, rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.06) 1px, transparent 1px)',
                            backgroundSize: `${gridSize * 3}px ${gridSize * 3}px, ${gridSize * 3}px ${gridSize * 3}px, ${gridSize}px ${gridSize}px, ${gridSize}px ${gridSize}px`,
                          }}
                        />
                      )}
                      {showCanvasGuides && bodyLayoutMode === 'split' && (
                        <div
                          aria-hidden
                          data-testid={pageIndex === 0 ? 'shopping-list-builder-split-line' : undefined}
                          data-body-column-gap={bodyColumnGap}
                          className="pointer-events-none absolute z-6"
                          style={{
                            left: template.paper.width / 2,
                            top: headerHeight,
                            bottom: footerHeight,
                            width: 1,
                            backgroundColor: BODY_SPLIT_GUIDE_COLOR,
                          }}
                        />
                      )}
                      {showCanvasGuides && headerHeight > 0 && (
                        <div
                          aria-hidden
                          data-testid={pageIndex === 0 ? 'shopping-list-builder-header-line' : undefined}
                          data-header-height={headerHeight}
                          className="pointer-events-none absolute left-0 right-0 z-5"
                          style={{
                            top: headerHeight,
                            height: 1,
                            backgroundColor: HEADER_FOOTER_LINE_COLOR,
                          }}
                        />
                      )}
                      {showCanvasGuides && footerHeight > 0 && (
                        <div
                          aria-hidden
                          data-testid={pageIndex === 0 ? 'shopping-list-builder-footer-line' : undefined}
                          data-footer-height={footerHeight}
                          className="pointer-events-none absolute left-0 right-0 z-5"
                          style={{
                            top: template.paper.height - footerHeight,
                            height: 1,
                            backgroundColor: HEADER_FOOTER_LINE_COLOR,
                          }}
                        />
                      )}
                      {template.components
                        .filter((component) => {
                          // Components fully governed by the plan render via the
                          // segments / bodyPlacements branches below.
                          if (flowingTablePlan.plannedBodyComponentIds.has(component.id)) {
                            return false;
                          }
                          const componentRegion = getComponentRegion(component, template);
                          if (componentRegion === 'header' || componentRegion === 'footer') {
                            return shouldRenderHeaderFooterOnPage(component.repeatMode, pageIndex);
                          }
                          // Non-planned body components render on page 0 from
                          // their stored x/y (Freeform Mode behavior).
                          return pageIndex === 0;
                        })
                        .map((component) => renderCanvasComponent(component, {
                          key: `${pageIndex}:${component.id}`,
                          isDraggable: pageIndex === 0,
                          showRegionBadge: pageIndex === 0,
                        }))}
                      {flowingTablePlan.bodyPlacements
                        .filter((placement) => placement.pageIndex === pageIndex)
                        .map((placement) => {
                          const component = template.components.find((c) => c.id === placement.componentId);
                          if (!component) return null;
                          return renderCanvasComponent(component, {
                            key: `placement:${pageIndex}:${component.id}`,
                            left: placement.x,
                            top: placement.y,
                            height: placement.height,
                            isDraggable: true,
                            showRegionBadge: true,
                          });
                        })}
                      {flowingTablePlan.segments
                        .filter((segment) => segment.pageIndex === pageIndex)
                        .map((segment) => renderCanvasComponent(segment.component, {
                          key: `${segment.component.id}:${segment.pageIndex}:${segment.lane}:${segment.startRowIndex}`,
                          left: segment.x,
                          top: segment.y,
                          height: segment.height,
                          rows: segment.rows,
                          rowHeights: segment.rowHeights,
                          isDraggable: segment.isFirstSegment,
                          showRegionBadge: segment.isFirstSegment,
                          isContinuation: segment.isContinuation,
                        }))}
                      {reorderState?.target && reorderState.target.pageIndex === pageIndex && (
                        <div
                          aria-hidden
                          data-testid={pageIndex === 0 ? 'shopping-list-builder-reorder-line' : undefined}
                          className="pointer-events-none absolute z-50 rounded-[2px]"
                          style={{
                            left: reorderState.target.x,
                            top: reorderState.target.y - 4,
                            width: reorderState.target.width,
                            height: 8,
                            backgroundColor: 'rgba(220, 38, 38, 0.95)',
                            boxShadow: '0 0 0 1px rgba(127, 29, 29, 0.6)',
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </main>

          <aside className="flex flex-col rounded-md border bg-card p-3">
            <PageSetupPanel
              layoutMode={layoutMode}
              bodyLayoutMode={bodyLayoutMode}
              gridSize={gridSize}
              paperHeight={template.paper.height}
              headerHeight={headerHeight}
              footerHeight={footerHeight}
              maxPages={maxPages}
              printMode={printMode}
              includeCategoryIcons={includeCategoryIcons}
              onCommitHeader={setHeaderHeight}
              onCommitFooter={setFooterHeight}
              onChangeBodyLayoutMode={setBodyLayoutMode}
              onChangeMaxPages={setMaxPages}
              onChangePrintMode={setPrintMode}
              onChangeIncludeCategoryIcons={setIncludeCategoryIcons}
            />
            <Separator className="my-3" />
            <div className="mb-3 flex items-center justify-between">
              <div>
                <BuilderSectionLabel
                  className="text-sm font-semibold"
                  icon={{ type: 'bridged', icon: LayoutPanelTopIcon }}
                >
                  Properties
                </BuilderSectionLabel>
                <p className="text-xs text-muted-foreground">
                  {selectedComponent ? componentTypeLabel(selectedComponent.type) : 'No component selected'}
                </p>
              </div>
              {selectedComponent && <Badge variant="outline">{selectedComponent.type}</Badge>}
            </div>

            {selectedComponent ? (
              <div className="space-y-3">
                <AnimateIcon asChild animateOnHover animateOnTap>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="builder-save-selected-component"
                    className="w-full justify-start"
                    onClick={saveSelectedComponent}
                    disabled={isSavingComponent}
                  >
                    {isSavingComponent ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <SaveIcon size={16} />
                    )}
                    {isEditingSelectedSavedComponent ? 'Update Saved Component' : 'Save Selected Component'}
                  </Button>
                </AnimateIcon>
                {isEditingSelectedSavedComponent && (
                  <Badge variant="secondary" className="w-full justify-center">
                    Editing saved component
                  </Badge>
                )}

              <AnimatedTabs defaultValue="layout" className="w-full">
                <AnimatedTabsList className="grid w-full grid-cols-2">
                  <AnimatedTabsTrigger value="layout" data-testid="builder-layout-tab">
                    Layout
                  </AnimatedTabsTrigger>
                  <AnimatedTabsTrigger value="content" data-testid="builder-content-tab">
                    Content
                  </AnimatedTabsTrigger>
                </AnimatedTabsList>
                <AnimatedTabsContents className="mt-4 px-1 pb-1">
                  <AnimatedTabsContent value="layout" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="component-name">Name</Label>
                    <Input
                      id="component-name"
                      data-testid="builder-selected-component-name-input"
                      value={selectedComponent.name}
                      onChange={(event) => updateSelectedComponent({ name: event.target.value })}
                    />
                  </div>

                  {!isInventorySectionTable(selectedComponent) && (
                    <div className="space-y-2">
                      <Label>Page Region</Label>
                      <Select
                        value={selectedComponentRegion ?? getComponentRegion(selectedComponent, template)}
                        onValueChange={(value) => changeComponentRegion(
                          selectedComponent.id,
                          value as BuilderComponentRegion,
                        )}
                      >
                        <SelectTrigger data-testid="builder-selected-component-region-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BUILDER_COMPONENT_REGIONS.map((region) => (
                            <SelectItem
                              key={region}
                              value={region}
                              disabled={!canPlaceComponentInRegion(selectedComponent, template, region)}
                            >
                              {componentRegionLabel(region)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {componentRegionDescription(selectedComponentRegion ?? getComponentRegion(selectedComponent, template))}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="component-x">X</Label>
                      <Input
                        id="component-x"
                        type="number"
                        value={selectedComponent.x}
                        onChange={(event) => updateSelectedComponent({ x: toNumber(event.target.value, selectedComponent.x) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="component-y">Y</Label>
                      <Input
                        id="component-y"
                        type="number"
                        value={selectedComponent.y}
                        onChange={(event) => updateSelectedComponent({ y: toNumber(event.target.value, selectedComponent.y) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="component-width">Width</Label>
                      <Input
                        id="component-width"
                        type="number"
                        value={selectedComponent.width}
                        onChange={(event) => updateSelectedComponent({ width: toNumber(event.target.value, selectedComponent.width) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="component-height">Height</Label>
                      <Input
                        id="component-height"
                        type="number"
                        value={Math.round(getComponentHeight(selectedComponent, sectionTableMeasurement))}
                        onChange={(event) => updateSelectedComponent({ height: toNumber(event.target.value, selectedComponent.height) })}
                        disabled={selectedComponent.type === 'section-table'}
                      />
                    </div>
                  </div>

                  {selectedComponent.type === 'section-table' && selectedComponent.inventorySource && previewLanguage && (() => {
                    const previewAdjustment = normalizeSectionTableTranslationHeightAdjustment(
                      selectedComponent.translationHeightAdjustments?.[previewLanguage],
                    );
                    return (
                      <div className="flex items-center justify-between gap-3 rounded-md border translation-options-column p-3">
                        <div className="min-w-0 space-y-1">
                          <Label className="text-sm font-medium">Preview Height</Label>
                          <p className="text-xs text-muted-foreground">
                            {previewLanguage}: {previewAdjustment > 0 ? `+${previewAdjustment}` : previewAdjustment} grid squares
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <AnimateIcon asChild animateOnHover animateOnTap>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Decrease translated table preview height"
                              onClick={() => updateSelectedSectionTableTranslationHeightAdjustment(previewAdjustment - 1)}
                            >
                              <MinusIcon size={16} />
                            </Button>
                          </AnimateIcon>
                          <AnimateIcon asChild animateOnHover animateOnTap>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Reset translated table preview height"
                              disabled={previewAdjustment === 0}
                              onClick={() => updateSelectedSectionTableTranslationHeightAdjustment(0)}
                            >
                              <RotateCcwIcon size={16} />
                            </Button>
                          </AnimateIcon>
                          <AnimateIcon asChild animateOnHover animateOnTap>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Increase translated table preview height"
                              onClick={() => updateSelectedSectionTableTranslationHeightAdjustment(previewAdjustment + 1)}
                            >
                              <PlusIcon size={16} />
                            </Button>
                          </AnimateIcon>
                        </div>
                      </div>
                    );
                  })()}

                  {selectedComponent.type === 'section-table' && (
                    <div className="space-y-2">
                      <Label>Table Behavior</Label>
                      <Select
                        value={getSectionTableFlowMode(selectedComponent)}
                        onValueChange={(value) => updateSelectedComponent({
                          flowMode: value as SectionTableBuilderComponent['flowMode'],
                          repeatHeaderRows: value === 'flowing' ? true : selectedComponent.repeatHeaderRows,
                          keepHeaderWithFirstRow: value === 'flowing' ? true : selectedComponent.keepHeaderWithFirstRow,
                          keepRowsTogether: value === 'flowing' ? true : selectedComponent.keepRowsTogether,
                        })}
                      >
                        <SelectTrigger data-testid="builder-table-flow-mode-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed table</SelectItem>
                          <SelectItem value="flowing">Flowing table</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {selectedComponent.type === 'line' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Direction</Label>
                        <Select
                          value={selectedComponent.direction}
                          onValueChange={(value) => updateSelectedComponent({ direction: value as LineBuilderComponent['direction'] })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="horizontal">Horizontal</SelectItem>
                            <SelectItem value="vertical">Vertical</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="line-stroke">Stroke</Label>
                        <Input
                          id="line-stroke"
                          type="number"
                          value={selectedComponent.strokeWidth}
                          onChange={(event) => updateSelectedComponent({ strokeWidth: toNumber(event.target.value, selectedComponent.strokeWidth) })}
                        />
                      </div>
                    </div>
                  )}
                  </AnimatedTabsContent>

                  <AnimatedTabsContent value="content" className="space-y-4">
                  {selectedComponent.type === 'text' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="text-content">Text</Label>
                        <Textarea
                          id="text-content"
                          value={selectedComponent.content}
                          onChange={(event) => updateSelectedComponent({ content: event.target.value })}
                          className="min-h-[96px]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="text-font-size">Font size</Label>
                          <Select
                            value={String(selectedComponent.fontSize)}
                            onValueChange={(value) => {
                              const newFontSize = Number(value);
                              // Auto-snap height: estimate wrapped lines at the new
                              // font and snap up to the next 9pt grid multiple so
                              // the box always contains the rendered text.
                              const availableWidth = Math.max(
                                1,
                                selectedComponent.width - 2 * BUILDER_CELL_VERTICAL_PADDING_PT,
                              );
                              const lineCount = typographyEstimateLineCount(
                                selectedComponent.content,
                                availableWidth,
                                newFontSize,
                              );
                              const newHeight = typographySnapHeightForFontSize(
                                newFontSize,
                                lineCount,
                                selectedComponent.lineHeight,
                              );
                              updateSelectedComponent({ fontSize: newFontSize, height: newHeight });
                            }}
                          >
                            <SelectTrigger id="text-font-size">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(BUILDER_FONT_SIZES.includes(selectedComponent.fontSize as never)
                                ? BUILDER_FONT_SIZES
                                : [...BUILDER_FONT_SIZES, selectedComponent.fontSize].sort((a, b) => a - b)
                              ).map((size) => (
                                <SelectItem key={String(size)} value={String(size)}>
                                  {size} pt
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Weight</Label>
                          <Select
                            value={selectedComponent.fontWeight}
                            onValueChange={(value) => updateSelectedComponent({ fontWeight: value as TextBuilderComponent['fontWeight'] })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="bold">Bold</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Alignment</Label>
                          <Select
                            value={selectedComponent.align}
                            onValueChange={(value) => updateSelectedComponent({ align: value as TextBuilderComponent['align'] })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="text-line-height">Line height</Label>
                          <Input
                            id="text-line-height"
                            type="number"
                            step="0.05"
                            value={selectedComponent.lineHeight}
                            onChange={(event) => updateSelectedComponent({ lineHeight: toNumber(event.target.value, selectedComponent.lineHeight) })}
                          />
                        </div>
                      </div>
                      {/*
                        Per-component translation settings. Opens a modal with
                        a live preview that shows how this text component
                        will render in a chosen target language at each of
                        the three modes (skip / translate / translate-with-
                        original). The chosen mode persists with the
                        template as `translationMode` and is honoured by
                        the backend renderer at PDF generation time.
                      */}
                      <div className="flex items-center justify-between gap-3 rounded-md border bg-card/40 p-2">
                        <div className="min-w-0 space-y-0.5">
                          <Label className="text-sm font-medium">Translation Settings</Label>
                          <p className="text-xs text-muted-foreground">
                            Mode:&nbsp;
                            <span className="font-medium text-foreground">
                              {translationModeLabel(selectedComponent.translationMode ?? DEFAULT_BUILDER_TRANSLATION_MODE)}
                            </span>
                          </p>
                        </div>
                        <AnimateIcon asChild animateOnHover animateOnTap>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTranslationSettingsTargetId(selectedComponent.id)}
                          >
                            <LanguagesIcon size={16} />
                            Configure
                          </Button>
                        </AnimateIcon>
                      </div>
                    </>
                  )}

                  {selectedComponent.type === 'form-field-group' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="form-label-width">Label width</Label>
                          <Input
                            id="form-label-width"
                            type="number"
                            value={selectedComponent.labelWidth}
                            onChange={(event) => updateSelectedComponent({ labelWidth: toNumber(event.target.value, selectedComponent.labelWidth) })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="form-font-size">Font size</Label>
                          <Select
                            value={String(selectedComponent.fontSize)}
                            onValueChange={(value) => updateSelectedComponent({ fontSize: Number(value) })}
                          >
                            <SelectTrigger id="form-font-size">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(BUILDER_FONT_SIZES.includes(selectedComponent.fontSize as never)
                                ? BUILDER_FONT_SIZES
                                : [...BUILDER_FONT_SIZES, selectedComponent.fontSize].sort((a, b) => a - b)
                              ).map((size) => (
                                <SelectItem key={String(size)} value={String(size)}>
                                  {size} pt
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="form-corner-radius">Corner radius</Label>
                        <Select
                          value={String(selectedComponent.cornerRadius ?? 0)}
                          onValueChange={(value) => updateSelectedComponent({ cornerRadius: Number(value) })}
                        >
                          <SelectTrigger id="form-corner-radius">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">Square</SelectItem>
                            <SelectItem value="3">3 pt</SelectItem>
                            <SelectItem value="6">6 pt</SelectItem>
                            <SelectItem value="9">9 pt</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="form-show-dividers"
                          checked={selectedComponent.showColumnDividers !== false}
                          onCheckedChange={(checked) => updateSelectedComponent({ showColumnDividers: checked === true })}
                        />
                        <Label htmlFor="form-show-dividers">Show column dividers</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="form-show-borders"
                          checked={selectedComponent.showBorders !== false}
                          onCheckedChange={(checked) => updateSelectedComponent({ showBorders: checked === true })}
                        />
                        <Label htmlFor="form-show-borders">Show table &amp; cell borders</Label>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Fields</Label>
                          <AnimateIcon asChild animateOnHover animateOnTap>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const fieldId = `${selectedComponent.id}-field-${Date.now()}`;
                                updateSelectedComponent({
                                  fields: [...selectedComponent.fields, { id: fieldId, label: 'New Field' }],
                                });
                              }}
                            >
                              <PlusIcon size={16} />
                              Add
                            </Button>
                          </AnimateIcon>
                        </div>
                        {selectedComponent.fields.map((field, index) => (
                          <div key={field.id} className="rounded-md border bg-background p-2">
                            <div className="mb-2 flex items-center justify-between">
                              <Badge variant="outline">Row {index + 1}</Badge>
                              <AnimateIcon asChild animateOnHover animateOnTap>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  aria-label="Remove field"
                                  onClick={() =>
                                    updateSelectedComponent({
                                      fields: selectedComponent.fields.filter((current) => current.id !== field.id),
                                    })
                                  }
                                >
                                  <Trash2Icon size={16} />
                                </Button>
                              </AnimateIcon>
                            </div>
                            <div className="space-y-2">
                              <Input
                                value={field.label}
                                onChange={(event) =>
                                  updateSelectedComponent({
                                    fields: selectedComponent.fields.map((current) =>
                                      current.id === field.id ? { ...current, label: event.target.value } : current,
                                    ),
                                  })
                                }
                              />
                              <div className="space-y-2">
                                <Label>Translation</Label>
                                <Select
                                  value={field.translationMode ?? DEFAULT_BUILDER_TRANSLATION_MODE}
                                  onValueChange={(value) =>
                                    updateSelectedComponent({
                                      fields: selectedComponent.fields.map((current) =>
                                        current.id === field.id
                                          ? { ...current, translationMode: value as BuilderTranslationMode }
                                          : current,
                                      ),
                                    })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="skip">Do not translate</SelectItem>
                                    <SelectItem value="translate">Translate</SelectItem>
                                    <SelectItem value="translate-with-original">Include English</SelectItem>
                                    <SelectItem value="translate-with-original-block">Include English (with line break)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {selectedComponent.type === 'section-table' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="table-title">Title</Label>
                        <Input
                          id="table-title"
                          value={selectedComponent.title}
                          onChange={(event) => updateSelectedComponent({ title: event.target.value })}
                        />
                      </div>
                      {selectedComponent.inventorySource && (
                        <div className="rounded-md border translation-options-column p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium text-foreground">
                                {selectedComponent.inventorySource.categoryName} category
                              </div>
                              <div className="text-muted-foreground">
                                {selectedComponent.categoryLimit && selectedComponent.categoryLimit > 0
                                  ? `${formatCategoryLimitTag(selectedComponent.categoryLimit, selectedComponent.categoryLimitType)}`
                                  : 'No category limit set'}
                              </div>
                            </div>
                            <AnimateIcon asChild animateOnHover animateOnTap>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                data-testid="builder-edit-category-trigger"
                                onClick={() => {
                                  if (selectedComponent.inventorySource) {
                                    setEditingCategoryId(selectedComponent.inventorySource.categoryId);
                                  }
                                }}
                              >
                                <SettingsIcon size={14} />
                                Edit Category
                              </Button>
                            </AnimateIcon>
                          </div>
                        </div>
                      )}
                      {/*
                        Translation Settings apply to every section table --
                        inventory-backed and base-component alike. Both share
                        the SectionTableBuilderComponent type, the
                        `translationSettings` field, and the Headers / Tags /
                        Rows render contract, so the control is no longer
                        gated to `inventorySource`.
                      */}
                      <div className="rounded-md border translation-options-column p-3">
                        {(() => {
                          const settings = resolveSectionTableTranslationSettings(selectedComponent.translationSettings);
                          return (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 space-y-1">
                                  <Label className="text-sm font-medium">Translation Settings</Label>
                                  <p className="text-xs text-muted-foreground">
                                    Headers: {translationModeLabel(settings.headers)}
                                    {' | '}
                                    Tags: {translationModeLabel(settings.tags)}
                                    {' | '}
                                    Rows: {translationModeLabel(settings.rows)}
                                  </p>
                                </div>
                                <AnimateIcon asChild animateOnHover animateOnTap>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSectionTableTranslationSettingsTargetId(selectedComponent.id)}
                                  >
                                    <LanguagesIcon size={16} />
                                    Configure
                                  </Button>
                                </AnimateIcon>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="table-row-height">Row height</Label>
                          <Input
                            id="table-row-height"
                            type="number"
                            value={selectedComponent.rowHeight}
                            onChange={(event) => updateSelectedComponent({ rowHeight: toNumber(event.target.value, selectedComponent.rowHeight) })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="table-font-size">Font size</Label>
                          {(() => {
                            // Section-table font-size is gated to <=12pt while
                            // the body is in Split-page layout. Larger fonts
                            // are unlocked automatically in Full-page mode.
                            // The current value is always shown even if it is
                            // outside the active list (e.g. a saved template
                            // at 18pt that was opened in Split mode); muted
                            // options render with a tooltip explaining why.
                            const isSplit = getTemplateBodyLayoutMode(template) === 'split';
                            const activeList = isSplit ? SPLIT_PAGE_FONT_SIZES : BUILDER_FONT_SIZES;
                            const currentValue = selectedComponent.fontSize;
                            const displayList = activeList.includes(currentValue as never)
                              ? activeList
                              : [...activeList, currentValue].sort((a, b) => a - b);
                            const SPLIT_PAGE_HINT = `Split-page layout limits section-table sizes to ${SPLIT_PAGE_MAX_BUILDER_FONT_SIZE} pt. Switch to Full page to use larger sizes.`;
                            return (
                              <Select
                                value={String(currentValue)}
                                onValueChange={(value) => updateSelectedComponent({ fontSize: Number(value) })}
                              >
                                <SelectTrigger id="table-font-size">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {displayList.map((size) => {
                                    const muted = isSplit
                                      && size > SPLIT_PAGE_MAX_BUILDER_FONT_SIZE
                                      && size !== currentValue;
                                    if (muted) {
                                      // Not using SelectItem's `disabled` prop
                                      // because shadcn's disabled styling
                                      // applies pointer-events: none, which
                                      // would suppress the tooltip on hover.
                                      // Instead we visually mute the item and
                                      // intercept the selection with onSelect
                                      // preventDefault.
                                      return (
                                        <Tooltip key={String(size)} delayDuration={200}>
                                          <TooltipTrigger asChild>
                                            <SelectItem
                                              value={String(size)}
                                              className="cursor-not-allowed opacity-50 focus:bg-transparent focus:text-foreground"
                                              onSelect={(event) => event.preventDefault()}
                                            >
                                              {size} pt
                                            </SelectItem>
                                          </TooltipTrigger>
                                          <TooltipContent side="right" sideOffset={8} className="max-w-[220px] text-xs">
                                            {SPLIT_PAGE_HINT}
                                          </TooltipContent>
                                        </Tooltip>
                                      );
                                    }
                                    return (
                                      <SelectItem key={String(size)} value={String(size)}>
                                        {size} pt
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            );
                          })()}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="table-limit-width">Limit width</Label>
                          <Input
                            id="table-limit-width"
                            type="number"
                            value={selectedComponent.limitWidth}
                            onChange={(event) => updateSelectedComponent({ limitWidth: toNumber(event.target.value, selectedComponent.limitWidth) })}
                            disabled={!selectedComponent.showLimit}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="table-want-width">Want width</Label>
                          <Input
                            id="table-want-width"
                            type="number"
                            value={selectedComponent.wantWidth}
                            onChange={(event) => updateSelectedComponent({ wantWidth: toNumber(event.target.value, selectedComponent.wantWidth) })}
                            disabled={selectedComponent.showWant === false}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="table-corner-radius">Corner radius</Label>
                          <Select
                            value={String(selectedComponent.cornerRadius ?? 0)}
                            onValueChange={(value) => updateSelectedComponent({ cornerRadius: Number(value) })}
                          >
                            <SelectTrigger id="table-corner-radius">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">Square</SelectItem>
                              <SelectItem value="3">3 pt</SelectItem>
                              <SelectItem value="6">6 pt</SelectItem>
                              <SelectItem value="9">9 pt</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="table-show-limit"
                          checked={selectedComponent.showLimit}
                          onCheckedChange={(checked) => updateSelectedComponent({ showLimit: checked === true })}
                        />
                        <Label htmlFor="table-show-limit">Show limit column</Label>
                      </div>
                      {selectedComponent.showLimit && (
                        <div className="ml-6 flex items-center gap-2">
                          <Checkbox
                            id="table-show-global-limit"
                            checked={selectedComponent.showGlobalLimit !== false}
                            onCheckedChange={(checked) => updateSelectedComponent({ showGlobalLimit: checked === true })}
                          />
                          <Label htmlFor="table-show-global-limit">
                            Show Global Limit ({globalLimit}) for no-limit items
                          </Label>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="table-show-want"
                          checked={selectedComponent.showWant !== false}
                          onCheckedChange={(checked) => updateSelectedComponent({ showWant: checked === true })}
                        />
                        <Label htmlFor="table-show-want">Show want column</Label>
                      </div>
                      {selectedComponent.showWant !== false && (
                        <div className="ml-6 flex items-center gap-2">
                          <Checkbox
                            id="table-want-checkbox"
                            checked={resolveSectionTableWantControl(selectedComponent) === 'checkbox'}
                            onCheckedChange={(checked) =>
                              updateSelectedComponent({ wantControl: checked === true ? 'checkbox' : 'blank' })
                            }
                          />
                          <Label htmlFor="table-want-checkbox">Checkbox in Want column</Label>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="table-show-dividers"
                          checked={selectedComponent.showColumnDividers !== false}
                          onCheckedChange={(checked) => updateSelectedComponent({ showColumnDividers: checked === true })}
                        />
                        <Label htmlFor="table-show-dividers">Show column dividers</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="table-show-borders"
                          checked={selectedComponent.showBorders !== false}
                          onCheckedChange={(checked) => updateSelectedComponent({ showBorders: checked === true })}
                        />
                        <Label htmlFor="table-show-borders">Show table &amp; cell borders</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="table-show-status-icons"
                          checked={selectedComponent.showStatusIcons === true}
                          onCheckedChange={(checked) => updateSelectedComponent({ showStatusIcons: checked === true })}
                        />
                        <Label htmlFor="table-show-status-icons">Show status icons (Limited / Clearance)</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="table-alternate-rows"
                          checked={selectedComponent.alternateRows}
                          onCheckedChange={(checked) => updateSelectedComponent({ alternateRows: checked === true })}
                        />
                        <Label htmlFor="table-alternate-rows">Alternate row shading</Label>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Rows</Label>
                          {selectedComponent.inventorySource ? (
                            <DropdownMenu
                              onOpenChange={(open) => {
                                if (open) {
                                  void refreshFoodItems();
                                }
                              }}
                            >
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  data-testid="builder-add-inventory-row-trigger"
                                >
                                  <AnimateIcon asChild animateOnHover animateOnTap>
                                    <PlusIcon size={16} />
                                  </AnimateIcon>
                                  Add
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-72">
                                <DropdownMenuLabel>Add to {selectedComponent.title}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <AnimateIcon asChild animateOnHover animateOnTap>
                                  <DropdownMenuItem
                                    data-testid="builder-add-new-food-item"
                                    onSelect={() => {
                                      if (!selectedComponent.inventorySource) return;
                                      const ctx = {
                                        categoryId: selectedComponent.inventorySource.categoryId,
                                        categoryName: selectedComponent.inventorySource.categoryName,
                                      };
                                      window.setTimeout(() => setAddItemContext(ctx), DROPDOWN_TO_DIALOG_OPEN_DELAY_MS);
                                    }}
                                  >
                                    <CirclePlusIcon size={16} className="mr-2" />
                                    Add new item
                                  </DropdownMenuItem>
                                </AnimateIcon>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                  Mark back in stock
                                </DropdownMenuLabel>
                                {outOfStockItemsForCategory.length === 0 ? (
                                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    No out-of-stock items in this category.
                                  </div>
                                ) : (
                                  <ScrollArea className={cn(outOfStockItemsForCategory.length > 6 ? 'h-[180px] pr-2' : '')}>
                                    {outOfStockItemsForCategory.map((item) => (
                                      <AnimateIcon key={item.id} asChild animateOnHover animateOnTap>
                                        <DropdownMenuItem
                                          data-testid="builder-restock-out-of-stock-item"
                                          onSelect={() => {
                                            window.setTimeout(() => void handleAddOutOfStockItem(item), 0);
                                          }}
                                        >
                                          <PackageXIcon size={16} className="mr-2" />
                                          {item.name}
                                        </DropdownMenuItem>
                                      </AnimateIcon>
                                    ))}
                                  </ScrollArea>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <AnimateIcon asChild animateOnHover animateOnTap>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  updateSelectedComponent({
                                    rows: [
                                      ...selectedComponent.rows,
                                      { id: `${selectedComponent.id}-row-${Date.now()}`, item: 'New item', limit: '' },
                                    ],
                                  })
                                }
                              >
                                <PlusIcon size={16} />
                                Add
                              </Button>
                            </AnimateIcon>
                          )}
                        </div>
                        <ScrollArea className="h-[300px] pr-3">
                          <div className="space-y-3">
                            {selectedComponent.rows.map((row, index) => (
                              <div key={row.id} className="rounded-md border bg-background p-2" data-testid="builder-section-row">
                                <div className="mb-2 flex items-center justify-between">
                                  <Badge variant="outline">Row {index + 1}</Badge>
                                  {row.foodItemId ? (
                                    <SectionTableRowActionsMenu
                                      row={row}
                                      clearanceLabel={findFoodItemForRow(row)?.statusFlags.isClearance ? 'Clear Clearance' : 'Mark Clearance'}
                                      onEdit={() => handleEditInventoryRow(row)}
                                      onMarkOutOfStock={() => handleMarkOutOfStock(row)}
                                      onMarkClearance={() => handleMarkClearance(row)}
                                      onChangeCategory={() => handleOpenChangeCategory(row)}
                                      onDelete={() => handleOpenDeleteFoodItem(row)}
                                    />
                                  ) : (
                                    <AnimateIcon asChild animateOnHover animateOnTap>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        aria-label="Remove row"
                                        onClick={() =>
                                          updateSelectedComponent({
                                            rows: selectedComponent.rows.filter((current) => current.id !== row.id),
                                          })
                                        }
                                      >
                                        <Trash2Icon size={16} />
                                      </Button>
                                    </AnimateIcon>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <Textarea
                                    value={row.item}
                                    onChange={(event) =>
                                      updateSelectedComponent({
                                        rows: selectedComponent.rows.map((current) =>
                                          current.id === row.id ? { ...current, item: event.target.value } : current,
                                        ),
                                      })
                                    }
                                    className="min-h-[52px]"
                                  />
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={row.limit}
                                      placeholder="Limit"
                                      onChange={(event) =>
                                        updateSelectedComponent({
                                          rows: selectedComponent.rows.map((current) =>
                                            current.id === row.id ? { ...current, limit: event.target.value } : current,
                                          ),
                                        })
                                      }
                                      onBlur={(event) => {
                                        if (row.foodItemId) {
                                          void updateInventoryRowLimit(row, event.currentTarget.value);
                                        }
                                      }}
                                    />
                                    <Badge variant={row.foodItemId ? 'secondary' : 'outline'} className="shrink-0">
                                      {limitSourceLabel(row)}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    </>
                  )}

                  {selectedComponent.type === 'line' && (
                    <div className="text-sm text-muted-foreground">
                      Line content is controlled by its layout settings.
                    </div>
                  )}

                  {selectedComponent.type === 'language-tag' && (
                    <>
                      <div className="space-y-2">
                        <Label>Rendering option</Label>
                        <Select
                          value={selectedComponent.mode ?? DEFAULT_LANGUAGE_TAG_MODE}
                          onValueChange={(value) => updateSelectedComponent({ mode: value as BuilderLanguageTagMode })}
                        >
                          <SelectTrigger data-testid="builder-language-tag-mode-select">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['hide-english', 'english', 'native', 'native-with-english'] as BuilderLanguageTagMode[]).map((mode) => (
                              <SelectItem key={mode} value={mode}>
                                {languageTagModeLabel(mode)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="language-tag-font-size">Font size</Label>
                          <Select
                            value={String(selectedComponent.fontSize)}
                            onValueChange={(value) => {
                              const newFontSize = Number(value);
                              const newHeight = typographySnapHeightForFontSize(
                                newFontSize,
                                1,
                                selectedComponent.lineHeight,
                              );
                              updateSelectedComponent({ fontSize: newFontSize, height: newHeight });
                            }}
                          >
                            <SelectTrigger id="language-tag-font-size">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(BUILDER_FONT_SIZES.includes(selectedComponent.fontSize as never)
                                ? BUILDER_FONT_SIZES
                                : [...BUILDER_FONT_SIZES, selectedComponent.fontSize].sort((a, b) => a - b)
                              ).map((size) => (
                                <SelectItem key={String(size)} value={String(size)}>
                                  {size} pt
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Weight</Label>
                          <Select
                            value={selectedComponent.fontWeight}
                            onValueChange={(value) => updateSelectedComponent({ fontWeight: value as LanguageTagBuilderComponent['fontWeight'] })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="bold">Bold</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Alignment</Label>
                          <Select
                            value={selectedComponent.align}
                            onValueChange={(value) => updateSelectedComponent({ align: value as LanguageTagBuilderComponent['align'] })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="language-tag-line-height">Line height</Label>
                          <Input
                            id="language-tag-line-height"
                            type="number"
                            step="0.05"
                            value={selectedComponent.lineHeight}
                            onChange={(event) => updateSelectedComponent({ lineHeight: toNumber(event.target.value, selectedComponent.lineHeight) })}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {selectedComponent.type === 'legend' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="legend-layout">Layout</Label>
                          <Select
                            value={selectedComponent.layout}
                            onValueChange={(value) => updateSelectedComponent({ layout: value as 'horizontal' | 'vertical' })}
                          >
                            <SelectTrigger id="legend-layout"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="horizontal">Horizontal</SelectItem>
                              <SelectItem value="vertical">Vertical</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="legend-font-size">Font size</Label>
                          <Select
                            value={String(selectedComponent.fontSize)}
                            onValueChange={(value) => updateSelectedComponent({ fontSize: Number(value) })}
                          >
                            <SelectTrigger id="legend-font-size"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {BUILDER_FONT_SIZES.map((size) => (
                                <SelectItem key={String(size)} value={String(size)}>{size} pt</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="legend-show-limited"
                          checked={selectedComponent.showLimited}
                          onCheckedChange={(checked) => updateSelectedComponent({ showLimited: checked === true })}
                        />
                        <Label htmlFor="legend-show-limited">Show &quot;Limited&quot; entry</Label>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="legend-limited-label">Limited label</Label>
                        <Input
                          id="legend-limited-label"
                          value={selectedComponent.limitedLabel}
                          onChange={(event) => updateSelectedComponent({ limitedLabel: event.target.value })}
                          disabled={!selectedComponent.showLimited}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="legend-show-clearance"
                          checked={selectedComponent.showClearance}
                          onCheckedChange={(checked) => updateSelectedComponent({ showClearance: checked === true })}
                        />
                        <Label htmlFor="legend-show-clearance">Show &quot;Clearance&quot; entry</Label>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="legend-clearance-label">Clearance label</Label>
                        <Input
                          id="legend-clearance-label"
                          value={selectedComponent.clearanceLabel}
                          onChange={(event) => updateSelectedComponent({ clearanceLabel: event.target.value })}
                          disabled={!selectedComponent.showClearance}
                        />
                      </div>
                    </>
                  )}
                  {selectedComponent.type === 'date' && (
                    <>
                      <div className="space-y-2">
                        <Label>Date format</Label>
                        <Select
                          value={selectedComponent.formatId ?? DEFAULT_DATE_FORMAT_ID}
                          onValueChange={(value) => updateSelectedComponent({ formatId: value as BuilderDateFormatId })}
                        >
                          <SelectTrigger data-testid="builder-date-format-select">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BUILDER_DATE_FORMATS.map((entry) => (
                              <SelectItem key={entry.id} value={entry.id}>
                                <span className="flex flex-col text-left">
                                  <span>{entry.label}</span>
                                  <span className="text-xs text-muted-foreground">{entry.example}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Date source</Label>
                        <Select
                          value={selectedComponent.dateMode}
                          onValueChange={(value) => updateSelectedComponent({ dateMode: value as DateBuilderComponent['dateMode'] })}
                        >
                          <SelectTrigger data-testid="builder-date-mode-select">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="today">
                              <span className="flex flex-col text-left">
                                <span>Today</span>
                                <span className="text-xs text-muted-foreground">Resolves at render time</span>
                              </span>
                            </SelectItem>
                            <SelectItem value="custom">
                              <span className="flex flex-col text-left">
                                <span>Custom date</span>
                                <span className="text-xs text-muted-foreground">Pick a specific day</span>
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {selectedComponent.dateMode === 'custom' && (
                        <div className="space-y-2">
                          <Label>Custom date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                data-testid="builder-date-custom-trigger"
                                className="w-full justify-start gap-2"
                              >
                                <AnimateIcon asChild animateOnHover animateOnTap>
                                  <CalendarDaysIcon size={16} />
                                </AnimateIcon>
                                {selectedComponent.customDate
                                  ? formatBuilderDate(
                                    parseBuilderCustomDate(selectedComponent.customDate) ?? new Date(),
                                    selectedComponent.formatId ?? DEFAULT_DATE_FORMAT_ID,
                                  )
                                  : 'Pick a date'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-auto p-0">
                              <Calendar
                                mode="single"
                                captionLayout="dropdown"
                                selected={parseBuilderCustomDate(selectedComponent.customDate) ?? undefined}
                                onSelect={(date) => {
                                  if (!date) return;
                                  updateSelectedComponent({ customDate: toBuilderCustomDateIso(date) });
                                }}
                                fromYear={new Date().getFullYear() - 5}
                                toYear={new Date().getFullYear() + 5}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}
                      <div className="rounded-md border bg-card/40 p-2">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Translation Settings</Label>
                          <Select
                            value={selectedComponent.translationMode ?? DEFAULT_BUILDER_TRANSLATION_MODE}
                            onValueChange={(value) => updateSelectedComponent({ translationMode: value as BuilderTranslationMode })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="skip">Do not translate</SelectItem>
                              <SelectItem value="translate">Translate</SelectItem>
                              <SelectItem value="translate-with-original">Include English</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Mode: {translationModeLabel(selectedComponent.translationMode ?? DEFAULT_BUILDER_TRANSLATION_MODE)}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="date-font-size">Font size</Label>
                          <Select
                            value={String(selectedComponent.fontSize)}
                            onValueChange={(value) => {
                              const newFontSize = Number(value);
                              // Date renders a single resolved-date line. Snap
                              // height to the next 9pt multiple so the box
                              // contains the larger font at every supported size.
                              const newHeight = typographySnapHeightForFontSize(
                                newFontSize,
                                1,
                                selectedComponent.lineHeight,
                              );
                              updateSelectedComponent({ fontSize: newFontSize, height: newHeight });
                            }}
                          >
                            <SelectTrigger id="date-font-size">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(BUILDER_FONT_SIZES.includes(selectedComponent.fontSize as never)
                                ? BUILDER_FONT_SIZES
                                : [...BUILDER_FONT_SIZES, selectedComponent.fontSize].sort((a, b) => a - b)
                              ).map((size) => (
                                <SelectItem key={String(size)} value={String(size)}>
                                  {size} pt
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Weight</Label>
                          <Select
                            value={selectedComponent.fontWeight}
                            onValueChange={(value) => updateSelectedComponent({ fontWeight: value as DateBuilderComponent['fontWeight'] })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="bold">Bold</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Alignment</Label>
                          <Select
                            value={selectedComponent.align}
                            onValueChange={(value) => updateSelectedComponent({ align: value as DateBuilderComponent['align'] })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="date-line-height">Line height</Label>
                          <Input
                            id="date-line-height"
                            type="number"
                            step="0.05"
                            value={selectedComponent.lineHeight}
                            onChange={(event) => updateSelectedComponent({ lineHeight: toNumber(event.target.value, selectedComponent.lineHeight) })}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  </AnimatedTabsContent>
                </AnimatedTabsContents>
              </AnimatedTabs>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Select a component on the canvas.
              </div>
            )}
          </aside>
        </div>

        <Dialog
          open={renameSavedComponent != null}
          onOpenChange={(open) => {
            if (!open) {
              setRenameSavedComponent(null);
              setRenameSavedComponentName('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Saved Component</DialogTitle>
              <DialogDescription>
                Use a short name that helps staff recognize when this component belongs on a template.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void confirmRenameSavedComponent();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="saved-component-name">Name</Label>
                <Input
                  id="saved-component-name"
                  value={renameSavedComponentName}
                  onChange={(event) => setRenameSavedComponentName(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRenameSavedComponent(null)}>
                  Cancel
                </Button>
                <Button type="submit">Rename</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={componentPendingDelete != null}
          onOpenChange={(open) => {
            if (!open && !isDeletingSavedComponent) {
              setComponentPendingDelete(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Saved Component</AlertDialogTitle>
              <AlertDialogDescription>
                This removes {componentPendingDelete?.name ?? 'this saved component'} from your saved component list.
                Templates that already contain a copy of it will not be changed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingSavedComponent}>Cancel</AlertDialogCancel>
              <AnimateIcon asChild animateOnHover animateOnTap>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isDeletingSavedComponent}
                  data-testid="confirm-delete-saved-component"
                  onClick={() => void confirmDeleteSavedComponent()}
                >
                  {isDeletingSavedComponent ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2Icon size={16} />
                  )}
                  Delete
                </Button>
              </AnimateIcon>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <FoodItemEditDialog
          foodItem={editingFoodItem}
          open={editingFoodItem != null}
          onOpenChange={(open) => {
            if (!open) setEditingFoodItem(null);
          }}
          onSave={handleSaveEditedFoodItem}
          isLoading={isSavingFoodItem}
        />

        <AddFoodItemDialog
          open={addItemContext != null}
          onOpenChange={(open) => {
            if (!open) setAddItemContext(null);
          }}
          initialCategoryId={addItemContext?.categoryId}
          onSave={async (data) => {
            const success = await handleCreateFoodItem(data);
            if (success) setAddItemContext(null);
            return success;
          }}
          isLoading={isSavingFoodItem}
        />

        <CategoryEditDialog
          category={editingCategory}
          open={editingCategory != null}
          onOpenChange={(open) => {
            if (!open) setEditingCategoryId(null);
          }}
          onSave={handleSaveCategoryEdit}
          isLoading={isSavingCategory}
        />

        <Dialog
          open={changeCategoryItem != null}
          onOpenChange={(open) => {
            if (!open && !isChangingCategory) {
              setChangeCategoryItem(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5" />
                Change Category
              </DialogTitle>
              <DialogDescription>
                Move {changeCategoryItem?.name ?? 'this item'} to a different category.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="builder-change-category-select">New Category</Label>
              <Select value={changeCategoryTargetId} onValueChange={setChangeCategoryTargetId}>
                <SelectTrigger id="builder-change-category-select" data-testid="builder-change-category-select">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setChangeCategoryItem(null)}
                disabled={isChangingCategory}
              >
                Cancel
              </Button>
              <Button
                type="button"
                data-testid="builder-change-category-confirm"
                onClick={() => void confirmChangeCategory()}
                disabled={isChangingCategory || !changeCategoryTargetId}
              >
                {isChangingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Move Item
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={foodItemPendingDelete != null}
          onOpenChange={(open) => {
            if (!open && !isDeletingFoodItem) {
              setFoodItemPendingDelete(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Food Item</AlertDialogTitle>
              <AlertDialogDescription>
                Permanently delete {foodItemPendingDelete?.name ?? 'this food item'} from inventory.
                This will remove the item from every shopping list section that references it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingFoodItem}>Cancel</AlertDialogCancel>
              <AnimateIcon asChild animateOnHover animateOnTap>
                <Button
                  type="button"
                  variant="destructive"
                  data-testid="confirm-delete-food-item"
                  disabled={isDeletingFoodItem}
                  onClick={() => void confirmDeleteFoodItem()}
                >
                  {isDeletingFoodItem ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2Icon size={16} />
                  )}
                  Delete Item
                </Button>
              </AnimateIcon>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/*
          Per-component Translation Settings modal. Rendered conditionally so
          the dialog re-mounts (and resets its preview state) when the user
          opens it for a different text component. The dialog reads + writes
          `translationMode` on the selected text component via
          updateSelectedComponent; persistence is handled by the existing
          template-save pipeline (no schema migration, the field rides in
          templateData JSON).
        */}
        {translationSettingsTargetId && (() => {
          const target = template.components.find((c) => c.id === translationSettingsTargetId);
          if (!target || target.type !== 'text') return null;
          return (
            <TranslationSettingsDialog
              component={target}
              open
              onOpenChange={(next) => {
                if (!next) setTranslationSettingsTargetId(null);
              }}
              onSave={(mode) => {
                // Use the same single-component update path as every other
                // Properties-panel control so undo / history / save flows
                // pick up the change without special-casing.
                if (selectedId !== target.id) setSelectedId(target.id);
                updateSelectedComponent({ translationMode: mode } as Partial<TextBuilderComponent>);
              }}
            />
          );
        })()}

        {sectionTableTranslationSettingsTargetId && (() => {
          const target = template.components.find((c) => c.id === sectionTableTranslationSettingsTargetId);
          if (!target || target.type !== 'section-table') return null;
          return (
            <SectionTableTranslationSettingsDialog
              component={target}
              open
              onOpenChange={(next) => {
                if (!next) setSectionTableTranslationSettingsTargetId(null);
              }}
              onSave={(settings) => {
                if (selectedId !== target.id) setSelectedId(target.id);
                updateSelectedComponent({ translationSettings: settings } as Partial<SectionTableBuilderComponent>);
              }}
            />
          );
        })()}

        <Dialog
          open={missingPreviewTranslations != null}
          onOpenChange={(open) => {
            if (!open && !isUpdatingPreviewTranslations) {
              cancelPreviewTranslationUpdate();
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                Missing Preview Translations
              </DialogTitle>
              <DialogDescription>
                {missingPreviewTranslations ? (
                  <>
                    {missingPreviewTranslations.missingStrings.length}
                    {' text '}
                    {missingPreviewTranslations.missingStrings.length === 1 ? 'block needs' : 'blocks need'}
                    {' '}
                    {missingPreviewTranslations.language}
                    {' translations before the canvas can preview this language.'}
                  </>
                ) : (
                  'Some text blocks need translations before the canvas can preview this language.'
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border translation-options-column p-3 text-sm text-muted-foreground">
              Update Translations will use the existing Shopping List Builder
              translation pipeline and cache the missing text. Cancel returns
              the preview dropdown to English.
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={cancelPreviewTranslationUpdate}
                disabled={isUpdatingPreviewTranslations}
              >
                Cancel
              </Button>
              <AnimateIcon asChild animateOnHover animateOnTap>
                <Button
                  onClick={() => void updatePreviewTranslations()}
                  disabled={isUpdatingPreviewTranslations}
                >
                  {isUpdatingPreviewTranslations ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LanguagesIcon size={16} />
                  )}
                  Update Translations
                </Button>
              </AnimateIcon>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </TooltipProvider>
    </PreviewLanguageContext.Provider>
  );
}
