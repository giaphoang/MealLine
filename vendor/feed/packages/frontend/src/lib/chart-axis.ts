// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';

/**
 * The rendered width of an element, kept current as it resizes.
 *
 * A category axis cannot decide how to draw its labels without knowing how
 * much room it has, and that is a layout fact rather than a data one — the
 * same eight age bands are comfortable in a wide card and collide in a narrow
 * one. Returns 0 until the first measurement, which callers treat as "not
 * measured yet" and fall back to their roomy default.
 */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [width, setWidth] = React.useState(0);
  const observerRef = React.useRef<ResizeObserver | null>(null);

  /**
   * A callback ref, not `useRef` plus an effect.
   *
   * The effect version attaches on mount and never again, so a chart that is
   * not in the tree on the first render — anything behind a loading state or an
   * empty-data branch — is never measured, and its labels silently keep the
   * horizontal default however narrow the screen gets. That is exactly what
   * happened to Procurement's seasonal chart while Service's identical one
   * worked, because only one of them mounts behind a guard. A callback ref runs
   * whenever the node appears or is replaced.
   */
  const measureRef = React.useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;

    // Guarded because jsdom and older Safari lack it; without a measurement
    // the axis simply keeps its horizontal labels.
    if (typeof ResizeObserver === 'undefined') {
      setWidth(node.getBoundingClientRect().width);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (typeof measured === 'number') setWidth(measured);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  return [measureRef, width];
}

/**
 * Roughly how wide a label renders, in pixels.
 *
 * Deliberately an estimate rather than a canvas measurement: the decision it
 * feeds is "angle these or not", and being a few pixels out changes nothing
 * about the answer. 0.62em a character is close for the interface font at the
 * small sizes an axis uses.
 */
const estimateTextWidth = (label: string, fontSize: number) => label.length * fontSize * 0.62;

export interface CategoryAxisTicks {
  angle?: number;
  textAnchor?: 'middle' | 'end';
  height?: number;
  tick: { fontSize: number };
  interval: 0;
  /** Extra bottom margin the chart needs to fit angled labels. */
  extraHeight: number;
}

/**
 * How to draw a category axis that has to show every label.
 *
 * `interval={0}` is not negotiable on a banded chart — Recharts thins crowded
 * ticks, and an age axis reading "18-29, 45-59, 75-89, 105+" invites the reader
 * to believe those are the bands. But forcing every tick at a narrow width
 * pushes neighbouring labels flush against each other ("Under 18" against
 * "18-29"), which is the same illegibility by another route.
 *
 * So the labels tilt when, and only when, they would otherwise collide: a
 * horizontal label needs its own width plus a little air, and below that the
 * axis angles them and takes the height it needs to do it. A wide card is
 * unaffected and keeps the more readable horizontal labels.
 */
export function categoryAxisTicks(
  containerWidth: number,
  labels: string[],
  fontSize = 11,
): CategoryAxisTicks {
  const horizontal: CategoryAxisTicks = {
    tick: { fontSize },
    interval: 0,
    extraHeight: 0,
  };

  // Not measured yet, or nothing to draw: keep the roomy default rather than
  // tilting labels on a chart that may well have space for them.
  if (containerWidth <= 0 || labels.length === 0) return horizontal;

  const longest = labels.reduce((widest, label) => Math.max(widest, estimateTextWidth(label, fontSize)), 0);
  // The Y axis and margins eat into the band area; this is close enough for a
  // yes/no decision and errs toward tilting slightly early.
  const perBand = (containerWidth - 60) / labels.length;

  if (perBand >= longest + 6) return horizontal;

  // 35°, not 90°: enough to separate the labels while staying readable
  // left-to-right. The height is the vertical space a tilted label occupies
  // (sin 35° ≈ 0.57) plus room for the tick itself.
  const angled = Math.ceil(longest * 0.57) + 16;
  return {
    angle: -35,
    textAnchor: 'end',
    height: angled,
    tick: { fontSize },
    interval: 0,
    extraHeight: Math.max(0, angled - 30),
  };
}

/**
 * Measure a chart container and get the axis props its labels need.
 *
 * Wraps the measurement and the decision together, because every caller wants
 * both and the pair is easy to get subtly wrong apart — spreading
 * `extraHeight` onto an `<XAxis>` makes React warn about an unknown DOM
 * attribute, so it is returned separately rather than mixed into the props.
 *
 *   const [ref, axis, extraHeight] = useCategoryAxis(labels);
 *   <div ref={ref}>
 *     <ChartContainer style={{ height: `${260 + extraHeight}px` }}>
 *       <BarChart …><XAxis dataKey="label" {...axis} /></BarChart>
 *
 * Pass the labels as they are *rendered*, not the raw keys: a date bucket is
 * `2026-08-13` in the data and "Aug 13, 2026" on the axis, and the second is
 * what has to fit.
 */
export function useCategoryAxis<T extends HTMLElement = HTMLDivElement>(
  labels: string[],
  fontSize = 11,
): [(node: T | null) => void, Omit<CategoryAxisTicks, 'extraHeight'>, number] {
  const [ref, width] = useElementWidth<T>();
  const { extraHeight, ...axis } = categoryAxisTicks(width, labels, fontSize);
  return [ref, axis, extraHeight];
}
