// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

import * as React from "react";
import type { LucideProps } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "motion/react";

import { BotIcon as AnimateBotIcon } from "@/components/animate-ui/icons/bot";
import { GaugeIcon as AnimateGaugeIcon } from "@/components/animate-ui/icons/gauge";
import { __iconNode as ActivityNode } from "lucide-react/dist/esm/icons/activity.mjs";
import { __iconNode as AlertCircleNode } from "lucide-react/dist/esm/icons/circle-alert.mjs";
import { __iconNode as AlertTriangleNode } from "lucide-react/dist/esm/icons/triangle-alert.mjs";
import { __iconNode as AlignLeftNode } from "lucide-react/dist/esm/icons/text-align-start.mjs";
import { __iconNode as AppleNode } from "lucide-react/dist/esm/icons/apple.mjs";
import { __iconNode as ArrowLeftNode } from "lucide-react/dist/esm/icons/arrow-left.mjs";
import { __iconNode as ArrowLeftRightNode } from "lucide-react/dist/esm/icons/arrow-left-right.mjs";
import { __iconNode as ArrowUpDownNode } from "lucide-react/dist/esm/icons/arrow-up-down.mjs";
import { __iconNode as AudioWaveformNode } from "lucide-react/dist/esm/icons/audio-waveform.mjs";
import { __iconNode as BanNode } from "lucide-react/dist/esm/icons/ban.mjs";
import { __iconNode as BarChartNode } from "lucide-react/dist/esm/icons/chart-no-axes-column-increasing.mjs";
import { __iconNode as BarChart3Node } from "lucide-react/dist/esm/icons/chart-column.mjs";
import { __iconNode as BeefNode } from "lucide-react/dist/esm/icons/beef.mjs";
import { __iconNode as BellNode } from "lucide-react/dist/esm/icons/bell.mjs";
import { __iconNode as BellDotNode } from "lucide-react/dist/esm/icons/bell-dot.mjs";
import { __iconNode as BlocksNode } from "lucide-react/dist/esm/icons/blocks.mjs";
import { __iconNode as BookOpenNode } from "lucide-react/dist/esm/icons/book-open.mjs";
import { __iconNode as BookmarkNode } from "lucide-react/dist/esm/icons/bookmark.mjs";
import { __iconNode as BoxNode } from "lucide-react/dist/esm/icons/box.mjs";
import { __iconNode as BrainNode } from "lucide-react/dist/esm/icons/brain.mjs";
import { __iconNode as CalendarNode } from "lucide-react/dist/esm/icons/calendar.mjs";
import { __iconNode as CalendarDaysNode } from "lucide-react/dist/esm/icons/calendar-days.mjs";
import { __iconNode as CarrotNode } from "lucide-react/dist/esm/icons/carrot.mjs";
import { __iconNode as CheckNode } from "lucide-react/dist/esm/icons/check.mjs";
import { __iconNode as CheckCircleNode } from "lucide-react/dist/esm/icons/circle-check-big.mjs";
import { __iconNode as CheckCircle2Node } from "lucide-react/dist/esm/icons/circle-check.mjs";
import { __iconNode as CheckSquareNode } from "lucide-react/dist/esm/icons/square-check-big.mjs";
import { __iconNode as ChevronDownNode } from "lucide-react/dist/esm/icons/chevron-down.mjs";
import { __iconNode as ChevronLeftNode } from "lucide-react/dist/esm/icons/chevron-left.mjs";
import { __iconNode as ChevronRightNode } from "lucide-react/dist/esm/icons/chevron-right.mjs";
import { __iconNode as ChevronUpNode } from "lucide-react/dist/esm/icons/chevron-up.mjs";
import { __iconNode as ChevronsUpDownNode } from "lucide-react/dist/esm/icons/chevrons-up-down.mjs";
import { __iconNode as CircleNode } from "lucide-react/dist/esm/icons/circle.mjs";
import { __iconNode as CircleDollarSignNode } from "lucide-react/dist/esm/icons/circle-dollar-sign.mjs";
import { __iconNode as CircleHelpNode } from "lucide-react/dist/esm/icons/circle-question-mark.mjs";
import { __iconNode as CirclePlusNode } from "lucide-react/dist/esm/icons/circle-plus.mjs";
import { __iconNode as ClipboardPenLineNode } from "lucide-react/dist/esm/icons/clipboard-pen-line.mjs";
import { __iconNode as ClockNode } from "lucide-react/dist/esm/icons/clock.mjs";
import { __iconNode as CoinsNode } from "lucide-react/dist/esm/icons/coins.mjs";
import { __iconNode as Columns2Node } from "lucide-react/dist/esm/icons/columns-2.mjs";
import { __iconNode as CommandNode } from "lucide-react/dist/esm/icons/command.mjs";
import { __iconNode as CopyNode } from "lucide-react/dist/esm/icons/copy.mjs";
import { __iconNode as CpuNode } from "lucide-react/dist/esm/icons/cpu.mjs";
import { __iconNode as DatabaseNode } from "lucide-react/dist/esm/icons/database.mjs";
import { __iconNode as DollarSignNode } from "lucide-react/dist/esm/icons/dollar-sign.mjs";
import { __iconNode as DownloadNode } from "lucide-react/dist/esm/icons/download.mjs";
import { __iconNode as EditNode } from "lucide-react/dist/esm/icons/square-pen.mjs";
import { __iconNode as Edit3Node } from "lucide-react/dist/esm/icons/pen-line.mjs";
import { __iconNode as EggNode } from "lucide-react/dist/esm/icons/egg.mjs";
import { __iconNode as EyeNode } from "lucide-react/dist/esm/icons/eye.mjs";
import { __iconNode as EyeOffNode } from "lucide-react/dist/esm/icons/eye-off.mjs";
import { __iconNode as FileCheckNode } from "lucide-react/dist/esm/icons/file-check.mjs";
import { __iconNode as FileDownNode } from "lucide-react/dist/esm/icons/file-down.mjs";
import { __iconNode as FileIconNode } from "lucide-react/dist/esm/icons/file.mjs";
import { __iconNode as FileOutputNode } from "lucide-react/dist/esm/icons/file-output.mjs";
import { __iconNode as FileSearchNode } from "lucide-react/dist/esm/icons/file-search.mjs";
import { __iconNode as FileTextNode } from "lucide-react/dist/esm/icons/file-text.mjs";
import { __iconNode as FileUpNode } from "lucide-react/dist/esm/icons/file-up.mjs";
import { __iconNode as FileWarningNode } from "lucide-react/dist/esm/icons/file-exclamation-point.mjs";
import { __iconNode as FileXNode } from "lucide-react/dist/esm/icons/file-x.mjs";
import { __iconNode as FilesNode } from "lucide-react/dist/esm/icons/files.mjs";
import { __iconNode as FilterNode } from "lucide-react/dist/esm/icons/funnel.mjs";
import { __iconNode as FolderNode } from "lucide-react/dist/esm/icons/folder.mjs";
import { __iconNode as FolderArchiveNode } from "lucide-react/dist/esm/icons/folder-archive.mjs";
import { __iconNode as FolderCheckNode } from "lucide-react/dist/esm/icons/folder-check.mjs";
import { __iconNode as FolderSyncNode } from "lucide-react/dist/esm/icons/folder-sync.mjs";
import { __iconNode as FormInputNode } from "lucide-react/dist/esm/icons/rectangle-ellipsis.mjs";
import { __iconNode as ForwardNode } from "lucide-react/dist/esm/icons/forward.mjs";
import { __iconNode as FrameNode } from "lucide-react/dist/esm/icons/frame.mjs";
import { __iconNode as GalleryVerticalEndNode } from "lucide-react/dist/esm/icons/gallery-vertical-end.mjs";
import { __iconNode as GlobeNode } from "lucide-react/dist/esm/icons/globe.mjs";
import { __iconNode as Globe2Node } from "lucide-react/dist/esm/icons/earth.mjs";
import { __iconNode as GlobeLockNode } from "lucide-react/dist/esm/icons/globe-lock.mjs";
import { __iconNode as Grid2x2CheckNode } from "lucide-react/dist/esm/icons/grid-2x2-check.mjs";
import { __iconNode as Grid3x3Node } from "lucide-react/dist/esm/icons/grid-3x3.mjs";
import { __iconNode as GripVerticalNode } from "lucide-react/dist/esm/icons/grip-vertical.mjs";
import { __iconNode as HashNode } from "lucide-react/dist/esm/icons/hash.mjs";
import { __iconNode as HistoryNode } from "lucide-react/dist/esm/icons/rotate-ccw-clock.mjs";
import { __iconNode as HomeNode } from "lucide-react/dist/esm/icons/house.mjs";
import { __iconNode as InfoNode } from "lucide-react/dist/esm/icons/info.mjs";
import { __iconNode as KeyNode } from "lucide-react/dist/esm/icons/key.mjs";
import { __iconNode as KeyRoundNode } from "lucide-react/dist/esm/icons/key-round.mjs";
import { __iconNode as LanguagesNode } from "lucide-react/dist/esm/icons/languages.mjs";
import { __iconNode as LayoutGridNode } from "lucide-react/dist/esm/icons/layout-grid.mjs";
import { __iconNode as LayoutTemplateNode } from "lucide-react/dist/esm/icons/layout-template.mjs";
import { __iconNode as LibraryNode } from "lucide-react/dist/esm/icons/library.mjs";
import { __iconNode as LineChartNode } from "lucide-react/dist/esm/icons/chart-line.mjs";
import { __iconNode as ListNode } from "lucide-react/dist/esm/icons/list.mjs";
import { __iconNode as ListFilterNode } from "lucide-react/dist/esm/icons/list-filter.mjs";
import { __iconNode as ListPlusNode } from "lucide-react/dist/esm/icons/list-plus.mjs";
import { __iconNode as Loader2Node } from "lucide-react/dist/esm/icons/loader-circle.mjs";
import { __iconNode as LogOutNode } from "lucide-react/dist/esm/icons/log-out.mjs";
import { __iconNode as MailNode } from "lucide-react/dist/esm/icons/mail.mjs";
import { __iconNode as MapNode } from "lucide-react/dist/esm/icons/map.mjs";
import { __iconNode as Maximize2Node } from "lucide-react/dist/esm/icons/maximize-2.mjs";
import { __iconNode as MessageSquareMoreNode } from "lucide-react/dist/esm/icons/message-square-more.mjs";
import { __iconNode as MessageSquareQuoteNode } from "lucide-react/dist/esm/icons/message-square-quote.mjs";
import { __iconNode as MinusNode } from "lucide-react/dist/esm/icons/minus.mjs";
import { __iconNode as MoonStarNode } from "lucide-react/dist/esm/icons/moon-star.mjs";
import { __iconNode as MoreHorizontalNode } from "lucide-react/dist/esm/icons/ellipsis.mjs";
import { __iconNode as PackageNode } from "lucide-react/dist/esm/icons/package.mjs";
import { __iconNode as Package2Node } from "lucide-react/dist/esm/icons/package-2.mjs";
import { __iconNode as PackageXNode } from "lucide-react/dist/esm/icons/package-x.mjs";
import { __iconNode as PanelLeftNode } from "lucide-react/dist/esm/icons/panel-left.mjs";
import { __iconNode as PencilNode } from "lucide-react/dist/esm/icons/pencil.mjs";
import { __iconNode as PersonStandingNode } from "lucide-react/dist/esm/icons/person-standing.mjs";
import { __iconNode as PieChartNode } from "lucide-react/dist/esm/icons/chart-pie.mjs";
import { __iconNode as PlusNode } from "lucide-react/dist/esm/icons/plus.mjs";
import { __iconNode as PrinterNode } from "lucide-react/dist/esm/icons/printer.mjs";
import { __iconNode as RefreshCwNode } from "lucide-react/dist/esm/icons/refresh-cw.mjs";
import { __iconNode as RotateCcwNode } from "lucide-react/dist/esm/icons/rotate-ccw.mjs";
import { __iconNode as SaveNode } from "lucide-react/dist/esm/icons/save.mjs";
import { __iconNode as SearchNode } from "lucide-react/dist/esm/icons/search.mjs";
import { __iconNode as SearchCheckNode } from "lucide-react/dist/esm/icons/search-check.mjs";
import { __iconNode as ServerNode } from "lucide-react/dist/esm/icons/server.mjs";
import { __iconNode as SettingsNode } from "lucide-react/dist/esm/icons/settings.mjs";
import { __iconNode as Settings2Node } from "lucide-react/dist/esm/icons/settings-2.mjs";
import { __iconNode as ShapesNode } from "lucide-react/dist/esm/icons/shapes.mjs";
import { __iconNode as ShieldNode } from "lucide-react/dist/esm/icons/shield.mjs";
import { __iconNode as ShieldCheckNode } from "lucide-react/dist/esm/icons/shield-check.mjs";
import { __iconNode as ShoppingBagNode } from "lucide-react/dist/esm/icons/shopping-bag.mjs";
import { __iconNode as ShoppingCartNode } from "lucide-react/dist/esm/icons/shopping-cart.mjs";
import { __iconNode as SlidersNode } from "lucide-react/dist/esm/icons/sliders-vertical.mjs";
import { __iconNode as SnowflakeNode } from "lucide-react/dist/esm/icons/snowflake.mjs";
import { __iconNode as SoupNode } from "lucide-react/dist/esm/icons/soup.mjs";
import { __iconNode as SproutNode } from "lucide-react/dist/esm/icons/sprout.mjs";
import { __iconNode as SquareDashedMousePointerNode } from "lucide-react/dist/esm/icons/square-dashed-mouse-pointer.mjs";
import { __iconNode as SquarePenNode } from "lucide-react/dist/esm/icons/square-pen.mjs";
import { __iconNode as SquareTerminalNode } from "lucide-react/dist/esm/icons/square-terminal.mjs";
import { __iconNode as StarNode } from "lucide-react/dist/esm/icons/star.mjs";
import { __iconNode as StickyNoteNode } from "lucide-react/dist/esm/icons/sticky-note.mjs";
import { __iconNode as Table2Node } from "lucide-react/dist/esm/icons/table-2.mjs";
import { __iconNode as TagNode } from "lucide-react/dist/esm/icons/tag.mjs";
import { __iconNode as TextIconNode } from "lucide-react/dist/esm/icons/text-align-start.mjs";
import { __iconNode as TimerNode } from "lucide-react/dist/esm/icons/timer.mjs";
import { __iconNode as ToggleLeftNode } from "lucide-react/dist/esm/icons/toggle-left.mjs";
import { __iconNode as ToggleRightNode } from "lucide-react/dist/esm/icons/toggle-right.mjs";
import { __iconNode as Trash2Node } from "lucide-react/dist/esm/icons/trash-2.mjs";
import { __iconNode as UserRoundCogNode } from "lucide-react/dist/esm/icons/user-round-cog.mjs";
import { __iconNode as TrendingUpNode } from "lucide-react/dist/esm/icons/trending-up.mjs";
import { __iconNode as TriangleAlertNode } from "lucide-react/dist/esm/icons/triangle-alert.mjs";
import { __iconNode as TypeNode } from "lucide-react/dist/esm/icons/type.mjs";
import { __iconNode as TypeOutlineNode } from "lucide-react/dist/esm/icons/type-outline.mjs";
import { __iconNode as UndoNode } from "lucide-react/dist/esm/icons/undo.mjs";
import { __iconNode as Undo2Node } from "lucide-react/dist/esm/icons/undo-2.mjs";
import { __iconNode as UploadNode } from "lucide-react/dist/esm/icons/upload.mjs";
import { __iconNode as UserNode } from "lucide-react/dist/esm/icons/user.mjs";
import { __iconNode as UtensilsCrossedNode } from "lucide-react/dist/esm/icons/utensils-crossed.mjs";
import { __iconNode as VeganNode } from "lucide-react/dist/esm/icons/vegan.mjs";
import { __iconNode as WheatOffNode } from "lucide-react/dist/esm/icons/wheat-off.mjs";
import { __iconNode as XNode } from "lucide-react/dist/esm/icons/x.mjs";
import { __iconNode as XCircleNode } from "lucide-react/dist/esm/icons/circle-x.mjs";
import { __iconNode as ZapNode } from "lucide-react/dist/esm/icons/zap.mjs";

type IconNode = ReadonlyArray<readonly [string, Record<string, string | number>]>;
type MotionSvgElement = typeof motion.path;
type FallbackKind = "draw" | "slide" | "scale" | "pulse" | "fade" | "spin";

type SvgPrimitive = "path" | "circle" | "line" | "polyline" | "polygon" | "rect";

const motionElements: Record<SvgPrimitive, MotionSvgElement> = {
  path: motion.path,
  circle: motion.circle,
  line: motion.line,
  polyline: motion.polyline,
  polygon: motion.polygon,
  rect: motion.rect,
};

const DEFAULT_SIZE = 24;

const curatedFallbackKinds: Record<string, FallbackKind> = {
  AlertCircle: "pulse",
  AlertTriangle: "pulse",
  Bell: "slide",
  BellDot: "slide",
  Check: "draw",
  CheckCircle: "draw",
  CheckCircle2: "draw",
  ChevronDown: "slide",
  ChevronLeft: "slide",
  ChevronRight: "slide",
  ChevronUp: "slide",
  Download: "slide",
  FileText: "draw",
  Languages: "slide",
  Loader2: "spin",
  Package: "scale",
  RefreshCw: "spin",
  Search: "draw",
  Settings: "spin",
  Trash2: "slide",
  Upload: "slide",
  X: "draw",
  XCircle: "draw",
};

const fallbackCycle: FallbackKind[] = ["draw", "slide", "scale", "pulse", "fade"];

function hashIconName(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function fallbackKindForIcon(name: string): FallbackKind {
  if (curatedFallbackKinds[name]) return curatedFallbackKinds[name];
  if (name.startsWith("Chevron") || name.startsWith("Arrow")) return "slide";
  if (name.includes("Check") || name.includes("Edit") || name.includes("Pencil")) return "draw";
  if (name.includes("Alert") || name.includes("Info")) return "pulse";
  if (name.includes("Refresh") || name.includes("Rotate")) return "spin";
  return fallbackCycle[hashIconName(name) % fallbackCycle.length];
}

function primitiveVariants(kind: FallbackKind, tag: string, index: number, total: number): Variants {
  const delay = Math.min(index * 0.055, 0.28);
  const baseTransition = { duration: 0.72, ease: [0.22, 1, 0.36, 1], delay };
  const side = index % 2 === 0 ? -1 : 1;

  if (kind === "draw" && tag !== "circle") {
    return {
      hidden: { opacity: 0, pathLength: 0, pathOffset: 0.08 },
      visible: { opacity: 1, pathLength: 1, pathOffset: 0, transition: baseTransition },
    };
  }

  if (kind === "slide") {
    return {
      hidden: { opacity: 0, x: side * 2.5, y: total > 2 ? (index - total / 2) * 0.45 : 0 },
      visible: { opacity: 1, x: 0, y: 0, transition: baseTransition },
    };
  }

  if (kind === "scale") {
    return {
      hidden: { opacity: 0, scale: 0.72, transformOrigin: "center" },
      visible: { opacity: 1, scale: 1, transition: baseTransition },
    };
  }

  if (kind === "pulse") {
    return {
      hidden: { opacity: 0.2, scale: 0.86, transformOrigin: "center" },
      visible: {
        opacity: 1,
        scale: [0.86, 1.08, 1],
        transition: { ...baseTransition, duration: 0.84 },
      },
    };
  }

  if (kind === "spin") {
    return {
      hidden: { opacity: 0, rotate: -35, transformOrigin: "center" },
      visible: { opacity: 1, rotate: 0, transition: baseTransition },
    };
  }

  return {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: baseTransition },
  };
}

function iconHoverForKind(kind: FallbackKind) {
  if (kind === "spin") return { rotate: 12, scale: 1.08 };
  if (kind === "slide") return { x: 1, y: -1, scale: 1.08 };
  if (kind === "pulse") return { scale: 1.12 };
  return { y: -1, scale: 1.1 };
}

function createFallbackIcon(iconName: string, iconNode: IconNode) {
  const FallbackIcon = React.forwardRef<SVGSVGElement, LucideProps>(
    (
      {
        color = "currentColor",
        size = DEFAULT_SIZE,
        strokeWidth = 2,
        absoluteStrokeWidth,
        children,
        className,
        ...props
      },
      ref
    ) => {
      const shouldReduceMotion = useReducedMotion();
      const kind = fallbackKindForIcon(iconName);
      const numericSize = typeof size === "number" ? size : DEFAULT_SIZE;
      const finalStrokeWidth = absoluteStrokeWidth
        ? (Number(strokeWidth) * DEFAULT_SIZE) / numericSize
        : strokeWidth;

      return (
        <motion.svg
          ref={ref}
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={finalStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          data-feed-animated-icon="true"
          data-feed-no-icon-motion="true"
          initial={shouldReduceMotion ? false : "hidden"}
          animate="visible"
          whileHover={shouldReduceMotion ? undefined : iconHoverForKind(kind)}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
          transition={{ type: "spring", stiffness: 320, damping: 20 }}
          {...props}
        >
          {iconNode.map(([tag, attrs], index) => {
            const MotionElement = motionElements[tag as SvgPrimitive] ?? motion.path;
            // Lucide's __iconNode carries `key` *inside* each attrs object, so
            // spreading attrs re-introduces a key prop after the explicit one.
            // React warns about that and the spread value wins, discarding the
            // stable fallback below. Pull it out before spreading so the key is
            // passed directly and never reaches the DOM element as an attribute.
            const { key: nodeKey, ...primitiveAttrs } = attrs;
            return (
              <MotionElement
                key={String(nodeKey ?? iconName + "-" + index)}
                {...primitiveAttrs}
                variants={primitiveVariants(kind, tag, index, iconNode.length)}
              />
            );
          })}
          {children}
        </motion.svg>
      );
    }
  );

  FallbackIcon.displayName = iconName;
  return FallbackIcon;
}

// Native animate-ui components expose icon-specific prop unions; the adapter
// intentionally accepts that heterogeneous component surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createAnimateUiIcon<T extends React.ComponentType<any>>(
  iconName: string,
  Icon: T,
  defaults: Record<string, unknown> = {}
) {
  const SourcedIcon = React.forwardRef<SVGSVGElement, LucideProps>(
    ({ size = 24, className, ...props }, ref) => (
      <Icon
        ref={ref}
        size={size}
        className={className}
        data-feed-animated-icon="true"
        data-feed-no-icon-motion="true"
        {...defaults}
        {...props}
      />
    )
  );

  SourcedIcon.displayName = iconName;
  return SourcedIcon;
}

export const Activity = createFallbackIcon("Activity", ActivityNode);
export const AlertCircle = createFallbackIcon("AlertCircle", AlertCircleNode);
export const AlertTriangle = createFallbackIcon("AlertTriangle", AlertTriangleNode);
export const AlignLeft = createFallbackIcon("AlignLeft", AlignLeftNode);
export const Apple = createFallbackIcon("Apple", AppleNode);
export const ArrowLeft = createFallbackIcon("ArrowLeft", ArrowLeftNode);
export const ArrowLeftRight = createFallbackIcon("ArrowLeftRight", ArrowLeftRightNode);
export const ArrowUpDown = createFallbackIcon("ArrowUpDown", ArrowUpDownNode);
export const AudioWaveform = createFallbackIcon("AudioWaveform", AudioWaveformNode);
export const Ban = createFallbackIcon("Ban", BanNode);
export const BarChart = createFallbackIcon("BarChart", BarChartNode);
export const BarChart3 = createFallbackIcon("BarChart3", BarChart3Node);
export const Beef = createFallbackIcon("Beef", BeefNode);
export const Bell = createFallbackIcon("Bell", BellNode);
export const BellDot = createFallbackIcon("BellDot", BellDotNode);
export const Blocks = createFallbackIcon("Blocks", BlocksNode);
export const BookOpen = createFallbackIcon("BookOpen", BookOpenNode);
export const Bookmark = createFallbackIcon("Bookmark", BookmarkNode);
export const Bot = createAnimateUiIcon("Bot", AnimateBotIcon, { animateOnHover: "blink", animateOnTap: "wink", animateOnView: true });
export const Box = createFallbackIcon("Box", BoxNode);
export const Brain = createFallbackIcon("Brain", BrainNode);
export const Calendar = createFallbackIcon("Calendar", CalendarNode);
export const CalendarDays = createFallbackIcon("CalendarDays", CalendarDaysNode);
export const Carrot = createFallbackIcon("Carrot", CarrotNode);
export const Check = createFallbackIcon("Check", CheckNode);
export const CheckCircle = createFallbackIcon("CheckCircle", CheckCircleNode);
export const CheckCircle2 = createFallbackIcon("CheckCircle2", CheckCircle2Node);
export const CheckSquare = createFallbackIcon("CheckSquare", CheckSquareNode);
export const ChevronDown = createFallbackIcon("ChevronDown", ChevronDownNode);
export const ChevronLeft = createFallbackIcon("ChevronLeft", ChevronLeftNode);
export const ChevronRight = createFallbackIcon("ChevronRight", ChevronRightNode);
export const ChevronUp = createFallbackIcon("ChevronUp", ChevronUpNode);
export const ChevronsUpDown = createFallbackIcon("ChevronsUpDown", ChevronsUpDownNode);
export const Circle = createFallbackIcon("Circle", CircleNode);
export const CircleDollarSign = createFallbackIcon("CircleDollarSign", CircleDollarSignNode);
export const CircleHelp = createFallbackIcon("CircleHelp", CircleHelpNode);
export const CirclePlus = createFallbackIcon("CirclePlus", CirclePlusNode);
export const ClipboardPenLine = createFallbackIcon("ClipboardPenLine", ClipboardPenLineNode);
export const Clock = createFallbackIcon("Clock", ClockNode);
export const Coins = createFallbackIcon("Coins", CoinsNode);
export const Columns2 = createFallbackIcon("Columns2", Columns2Node);
export const Command = createFallbackIcon("Command", CommandNode);
export const Copy = createFallbackIcon("Copy", CopyNode);
export const Cpu = createFallbackIcon("Cpu", CpuNode);
export const Database = createFallbackIcon("Database", DatabaseNode);
export const DollarSign = createFallbackIcon("DollarSign", DollarSignNode);
export const Download = createFallbackIcon("Download", DownloadNode);
export const Edit = createFallbackIcon("Edit", EditNode);
export const Edit3 = createFallbackIcon("Edit3", Edit3Node);
export const Egg = createFallbackIcon("Egg", EggNode);
export const Eye = createFallbackIcon("Eye", EyeNode);
export const EyeOff = createFallbackIcon("EyeOff", EyeOffNode);
export const FileCheck = createFallbackIcon("FileCheck", FileCheckNode);
export const FileDown = createFallbackIcon("FileDown", FileDownNode);
export const FileIcon = createFallbackIcon("FileIcon", FileIconNode);
export const FileOutput = createFallbackIcon("FileOutput", FileOutputNode);
export const FileSearch = createFallbackIcon("FileSearch", FileSearchNode);
export const FileText = createFallbackIcon("FileText", FileTextNode);
export const FileUp = createFallbackIcon("FileUp", FileUpNode);
export const FileWarning = createFallbackIcon("FileWarning", FileWarningNode);
export const FileX = createFallbackIcon("FileX", FileXNode);
export const Files = createFallbackIcon("Files", FilesNode);
export const Filter = createFallbackIcon("Filter", FilterNode);
export const Folder = createFallbackIcon("Folder", FolderNode);
export const FolderArchive = createFallbackIcon("FolderArchive", FolderArchiveNode);
export const FolderCheck = createFallbackIcon("FolderCheck", FolderCheckNode);
export const FolderSync = createFallbackIcon("FolderSync", FolderSyncNode);
export const FormInput = createFallbackIcon("FormInput", FormInputNode);
export const Forward = createFallbackIcon("Forward", ForwardNode);
export const Frame = createFallbackIcon("Frame", FrameNode);
export const GalleryVerticalEnd = createFallbackIcon("GalleryVerticalEnd", GalleryVerticalEndNode);
export const Gauge = createAnimateUiIcon("Gauge", AnimateGaugeIcon, { animateOnHover: true, animateOnTap: true, animateOnView: true });
export const Globe = createFallbackIcon("Globe", GlobeNode);
export const Globe2 = createFallbackIcon("Globe2", Globe2Node);
export const GlobeLock = createFallbackIcon("GlobeLock", GlobeLockNode);
export const Grid2x2Check = createFallbackIcon("Grid2x2Check", Grid2x2CheckNode);
export const Grid3x3 = createFallbackIcon("Grid3x3", Grid3x3Node);
export const GripVertical = createFallbackIcon("GripVertical", GripVerticalNode);
export const Hash = createFallbackIcon("Hash", HashNode);
export const History = createFallbackIcon("History", HistoryNode);
export const Home = createFallbackIcon("Home", HomeNode);
export const Info = createFallbackIcon("Info", InfoNode);
export const Key = createFallbackIcon("Key", KeyNode);
export const KeyRound = createFallbackIcon("KeyRound", KeyRoundNode);
export const Languages = createFallbackIcon("Languages", LanguagesNode);
export const LayoutGrid = createFallbackIcon("LayoutGrid", LayoutGridNode);
export const LayoutTemplate = createFallbackIcon("LayoutTemplate", LayoutTemplateNode);
export const Library = createFallbackIcon("Library", LibraryNode);
export const LineChart = createFallbackIcon("LineChart", LineChartNode);
export const List = createFallbackIcon("List", ListNode);
export const ListFilter = createFallbackIcon("ListFilter", ListFilterNode);
export const ListPlus = createFallbackIcon("ListPlus", ListPlusNode);
export const Loader2 = createFallbackIcon("Loader2", Loader2Node);
export const LogOut = createFallbackIcon("LogOut", LogOutNode);
export const Mail = createFallbackIcon("Mail", MailNode);
export const Map = createFallbackIcon("Map", MapNode);
export const Maximize2 = createFallbackIcon("Maximize2", Maximize2Node);
export const MessageSquareMore = createFallbackIcon("MessageSquareMore", MessageSquareMoreNode);
export const MessageSquareQuote = createFallbackIcon("MessageSquareQuote", MessageSquareQuoteNode);
export const Minus = createFallbackIcon("Minus", MinusNode);
export const MoonStar = createFallbackIcon("MoonStar", MoonStarNode);
export const MoreHorizontal = createFallbackIcon("MoreHorizontal", MoreHorizontalNode);
export const Package = createFallbackIcon("Package", PackageNode);
export const Package2 = createFallbackIcon("Package2", Package2Node);
export const PackageX = createFallbackIcon("PackageX", PackageXNode);
export const PanelLeft = createFallbackIcon("PanelLeft", PanelLeftNode);
export const Pencil = createFallbackIcon("Pencil", PencilNode);
export const PersonStanding = createFallbackIcon("PersonStanding", PersonStandingNode);
export const PieChart = createFallbackIcon("PieChart", PieChartNode);
export const Plus = createFallbackIcon("Plus", PlusNode);
export const Printer = createFallbackIcon("Printer", PrinterNode);
export const RefreshCw = createFallbackIcon("RefreshCw", RefreshCwNode);
export const RotateCcw = createFallbackIcon("RotateCcw", RotateCcwNode);
export const Save = createFallbackIcon("Save", SaveNode);
export const Search = createFallbackIcon("Search", SearchNode);
export const SearchCheck = createFallbackIcon("SearchCheck", SearchCheckNode);
export const Server = createFallbackIcon("Server", ServerNode);
export const Settings = createFallbackIcon("Settings", SettingsNode);
export const Settings2 = createFallbackIcon("Settings2", Settings2Node);
export const Shapes = createFallbackIcon("Shapes", ShapesNode);
export const Shield = createFallbackIcon("Shield", ShieldNode);
export const ShieldCheck = createFallbackIcon("ShieldCheck", ShieldCheckNode);
export const ShoppingBag = createFallbackIcon("ShoppingBag", ShoppingBagNode);
export const ShoppingCart = createFallbackIcon("ShoppingCart", ShoppingCartNode);
export const Sliders = createFallbackIcon("Sliders", SlidersNode);
export const Snowflake = createFallbackIcon("Snowflake", SnowflakeNode);
export const Soup = createFallbackIcon("Soup", SoupNode);
export const Sprout = createFallbackIcon("Sprout", SproutNode);
export const SquareDashedMousePointer = createFallbackIcon("SquareDashedMousePointer", SquareDashedMousePointerNode);
export const SquarePen = createFallbackIcon("SquarePen", SquarePenNode);
export const SquareTerminal = createFallbackIcon("SquareTerminal", SquareTerminalNode);
export const Star = createFallbackIcon("Star", StarNode);
export const StickyNote = createFallbackIcon("StickyNote", StickyNoteNode);
export const Table2 = createFallbackIcon("Table2", Table2Node);
export const Tag = createFallbackIcon("Tag", TagNode);
export const TextIcon = createFallbackIcon("TextIcon", TextIconNode);
export const Timer = createFallbackIcon("Timer", TimerNode);
export const ToggleLeft = createFallbackIcon("ToggleLeft", ToggleLeftNode);
export const ToggleRight = createFallbackIcon("ToggleRight", ToggleRightNode);
export const Trash2 = createFallbackIcon("Trash2", Trash2Node);
export const UserRoundCog = createFallbackIcon("UserRoundCog", UserRoundCogNode);
export const TrendingUp = createFallbackIcon("TrendingUp", TrendingUpNode);
export const TriangleAlert = createFallbackIcon("TriangleAlert", TriangleAlertNode);
export const Type = createFallbackIcon("Type", TypeNode);
export const TypeOutline = createFallbackIcon("TypeOutline", TypeOutlineNode);
export const Undo = createFallbackIcon("Undo", UndoNode);
export const Undo2 = createFallbackIcon("Undo2", Undo2Node);
export const Upload = createFallbackIcon("Upload", UploadNode);
export const User = createFallbackIcon("User", UserNode);
export const UtensilsCrossed = createFallbackIcon("UtensilsCrossed", UtensilsCrossedNode);
export const Vegan = createFallbackIcon("Vegan", VeganNode);
export const WheatOff = createFallbackIcon("WheatOff", WheatOffNode);
export const X = createFallbackIcon("X", XNode);
export const XCircle = createFallbackIcon("XCircle", XCircleNode);
export const Zap = createFallbackIcon("Zap", ZapNode);

export type { LucideIcon } from "lucide-react";
