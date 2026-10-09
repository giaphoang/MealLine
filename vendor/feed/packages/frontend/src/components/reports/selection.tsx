// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

/**
 * ZEV-style report selection mode (Reports initiative §3).
 *
 * Selection order becomes PDF/CSV order and persists across all five
 * Reports tabs. Eligible cards wiggle (staggered; static under reduced
 * motion); selected cards stop and show a ring + checkmark + order number.
 * Enter/Space toggles a card; nested controls become inert only while
 * selecting. The provider enforces the 8-card cap client-side (the server
 * enforces it again).
 */

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { messageService } from "@/services/message";
import { MAX_REPORT_SELECTION } from "@/types/reports";

interface ReportSelectionContextValue {
  isSelecting: boolean;
  selectedIds: string[];
  /**
   * Each selected card's own controls, frozen when that card was selected.
   *
   * Some cards carry state the page-level filters do not describe — a search
   * box, a donor filter, a year picker. A report must reproduce what was on
   * screen, so that state travels with the request.
   *
   * Frozen when the visible card is selected, not read at generate time: the
   * modal offers no filter controls, so the run must mean what the card showed
   * when the user chose it. Capturing at selection also supports cross-lens
   * reports, because inactive Radix tab content is unmounted.
   */
  cardOptions: Record<string, unknown>;
  /** Cards publish their current controls here; cheap, and never re-renders. */
  registerOptions: (cardId: string, options: unknown) => void;
  startSelecting: () => void;
  cancelSelecting: () => void;
  toggleCard: (cardId: string) => void;
  moveCard: (cardId: string, direction: -1 | 1) => void;
  removeCard: (cardId: string) => void;
  clearSelection: () => void;
  applySelection: (cardIds: string[]) => void;
}

/** Stable empty array: a new literal each render would churn dependent effects. */
const EMPTY_SELECTION: string[] = [];

const ReportSelectionContext =
  React.createContext<ReportSelectionContextValue | null>(null);

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
};

/**
 * Selection state, or `null` outside a provider.
 *
 * `SelectableBlock` uses this rather than the throwing hook: selection is an
 * enhancement, so wrapping a card in it must never decide whether the page
 * renders. Twelve Analytics tests mount the procurement workspace directly,
 * with no report context, and a page has no business crashing because a
 * reporting feature is absent.
 */
export function useOptionalReportSelection(): ReportSelectionContextValue | null {
  return React.useContext(ReportSelectionContext);
}

/** Selection state, required. For the toolbar and modal, which cannot work without it. */
export function useReportSelection(): ReportSelectionContextValue {
  const context = React.useContext(ReportSelectionContext);
  if (!context) {
    throw new Error(
      "useReportSelection must be used within a ReportSelectionProvider"
    );
  }
  return context;
}

export function ReportSelectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSelecting, setIsSelecting] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [cardOptions, setCardOptions] = React.useState<Record<string, unknown>>({});
  // A ref, not state: cards write on every render, and storing this in state
  // would loop. Only the option captured when a card is selected becomes state.
  const liveOptions = React.useRef<Record<string, unknown>>({});
  const registerOptions = React.useCallback((cardId: string, options: unknown) => {
    liveOptions.current[cardId] = options;
  }, []);

  const value = React.useMemo<ReportSelectionContextValue>(
    () => ({
      isSelecting,
      selectedIds,
      startSelecting: () => {
        // Card options belong to the card the user actually selects, not to
        // every card that happened to be mounted when selection mode began.
        // Radix unmounts the inactive Analytics lens, so a start-time snapshot
        // could only contain a stale option from an earlier visit (or no option
        // at all). Each visible card is captured below when it is selected.
        setCardOptions({});
        setIsSelecting(true);
      },
      cardOptions,
      registerOptions,
      cancelSelecting: () => {
        setIsSelecting(false);
        setSelectedIds([]);
        setCardOptions({});
      },
      toggleCard: (cardId) => {
        if (selectedIds.includes(cardId)) {
          setSelectedIds(selectedIds.filter((id) => id !== cardId));
          setCardOptions((current) => {
            const next = { ...current };
            delete next[cardId];
            return next;
          });
          return;
        }
        if (selectedIds.length >= MAX_REPORT_SELECTION) {
          messageService.error(
            `Reports can include at most ${MAX_REPORT_SELECTION} blocks. Remove one before adding another.`
          );
          return;
        }

        setSelectedIds([...selectedIds, cardId]);
        const option = liveOptions.current[cardId];
        if (option !== undefined) {
          setCardOptions((current) => ({ ...current, [cardId]: option }));
        }
      },
      moveCard: (cardId, direction) => {
        setSelectedIds((current) => {
          const index = current.indexOf(cardId);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= current.length) {
            return current;
          }
          const next = [...current];
          [next[index], next[target]] = [next[target], next[index]];
          return next;
        });
      },
      removeCard: (cardId) => {
        setSelectedIds((current) => current.filter((id) => id !== cardId));
        setCardOptions((current) => {
          const next = { ...current };
          delete next[cardId];
          return next;
        });
      },
      clearSelection: () => {
        setSelectedIds([]);
        setCardOptions({});
      },
      applySelection: (cardIds) => {
        setSelectedIds(cardIds.slice(0, MAX_REPORT_SELECTION));
        setIsSelecting(true);
      },
    }),
    [isSelecting, selectedIds, cardOptions, registerOptions]
  );

  return (
    <ReportSelectionContext.Provider value={value}>
      {children}
    </ReportSelectionContext.Provider>
  );
}

/**
 * The width a block has to be for the full wiggle amplitude to look right —
 * roughly a half-width card on a desktop viewport.
 */
const WIGGLE_REFERENCE_WIDTH = 560;
const WIGGLE_BASE_TILT_DEG = 1.6;
const WIGGLE_MIN_TILT_DEG = 0.5;

/**
 * How far to tilt a block of this width.
 *
 * A rotation about the centre displaces the far corner by roughly
 * `(width / 2) × sin(angle)`, so a fixed angle makes a wide block sweep much
 * further than a narrow one. Scaling the angle by `reference / width` holds
 * that displacement roughly constant, which is what "the same wiggle" actually
 * means to someone looking at the page. The floor keeps a very wide block from
 * damping down to no perceptible motion at all.
 */
export function wiggleTiltDeg(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return WIGGLE_BASE_TILT_DEG;
  const scaled = WIGGLE_BASE_TILT_DEG * (WIGGLE_REFERENCE_WIDTH / width);
  return Math.min(WIGGLE_BASE_TILT_DEG, Math.max(WIGGLE_MIN_TILT_DEG, scaled));
}

/**
 * Wraps one selectable report block.
 *
 * Everything wiggles, tables included. There used to be a `variant="table"`
 * escape hatch that held tables still, on the theory that swaying a whole table
 * was too much; in use it read as the table simply not being selectable, which
 * is the opposite of what the motion is for. Width-scaled amplitude solves the
 * real problem — a table is wide, so it tilts less — without needing a second
 * visual language for the same action.
 */
export function SelectableBlock({
  cardId,
  children,
  className,
  options,
}: {
  cardId: string;
  children: React.ReactNode;
  className?: string;
  /** This card's own controls, when it has any the page filters do not cover. */
  options?: unknown;
}) {
  const selection = useOptionalReportSelection();
  const registerOptions = selection?.registerOptions;
  // Published during render rather than in an effect: startSelecting can fire
  // before an effect has flushed, and a stale snapshot is the whole failure
  // mode this exists to prevent.
  // Publish `undefined` too: a freshly mounted card with no current option must
  // clear any value left by an earlier visit to an unmounted lens.
  if (registerOptions) registerOptions(cardId, options);
  const isSelecting = selection?.isSelecting ?? false;
  const selectedIds = selection?.selectedIds ?? EMPTY_SELECTION;
  const toggleCard = selection?.toggleCard;
  const contentRef = React.useRef<HTMLDivElement>(null);
  const blockRef = React.useRef<HTMLDivElement>(null);
  const selectedIndex = selectedIds.indexOf(cardId);
  const isSelected = selectedIndex >= 0;
  const wiggleHash = Math.abs(hashString(cardId));

  // Measured continuously, not only while selecting: the width has to be known
  // the instant selection begins, or every block would start at full amplitude
  // and visibly settle. The ref is attached in both branches for the same
  // reason. ResizeObserver also covers viewport changes and a table growing a
  // column, which a one-off measurement would miss.
  const [blockWidth, setBlockWidth] = React.useState(0);
  React.useEffect(() => {
    const node = blockRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    setBlockWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setBlockWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [isSelecting]);

  // Nested controls (export buttons, table paging, chart tooltips) become
  // inert only during selection so the card itself is one big target.
  // React 18 has no `inert` prop; set the property imperatively.
  React.useEffect(() => {
    const node = contentRef.current as
      | (HTMLDivElement & { inert: boolean })
      | null;
    if (!node) return;
    node.inert = isSelecting;
    // `inert` is assigned imperatively, so React cannot remove it for us.
    // Explicit cleanup also protects this node if its owner ever unmounts
    // during selection.
    return () => {
      node.inert = false;
    };
  }, [isSelecting]);

  // The wrapper becomes the grid item wherever a card sits in a grid, so it
  // must hand its stretched height down. Without this the card keeps its own
  // content height and the taller sibling leaves a gap beneath it — 56px under
  // Procurement Channels when Acquisition Mix ran longer. `h-full` is inert
  // outside a stretching parent, so this costs nothing elsewhere.
  return (
    <div
      ref={blockRef}
      role={isSelecting ? "checkbox" : undefined}
      aria-checked={isSelecting ? isSelected : undefined}
      aria-label={isSelecting ? `Select report block ${cardId}` : undefined}
      tabIndex={isSelecting ? 0 : undefined}
      onClick={isSelecting ? () => toggleCard?.(cardId) : undefined}
      onKeyDown={(event) => {
        if (!isSelecting) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleCard?.(cardId);
        }
      }}
      className={cn(
        // Same height passthrough as above, so entering selection mode does
        // not change the layout it is selecting from.
        "relative min-w-0 h-full rounded-lg outline-hidden",
        isSelecting && "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isSelecting && !isSelected && "report-selectable",
        isSelecting && isSelected &&
          "report-selectable-selected ring-2 ring-primary ring-offset-2 ring-offset-background",
        className
      )}
      style={
        isSelecting && !isSelected
          ? ({
              // Match ZEV's rapid, organic selection motion: short loops
              // with small per-card duration and start-time differences.
              "--report-wiggle-delay": `${(wiggleHash % 6) * 60}ms`,
              "--report-wiggle-duration": `${
                820 + (wiggleHash % 5) * 75
              }ms`,
              "--report-wiggle-tilt": `${wiggleTiltDeg(blockWidth).toFixed(2)}deg`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {isSelecting && isSelected && (
        <span className="absolute -right-2 -top-2 z-10 flex items-center gap-1">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {selectedIndex + 1}
          </span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-4 w-4" />
          </span>
        </span>
      )}
      {/* Keep this exact wrapper in both modes. Changing the child tree here
          remounts stateful tables, resetting their sort and page before the
          user can select them for a report. */}
      <div ref={contentRef} className="min-w-0 h-full [&>*]:h-full">{children}</div>
    </div>
  );
}
