// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

'use client';

import * as React from 'react';
import { motion, isMotionComponent, type HTMLMotionProps } from 'motion/react';
import { cn } from '@/lib/utils';
import { mergeRefs } from '@/lib/merge-refs';

type AnyProps = Record<string, unknown>;

type DOMMotionProps<T extends HTMLElement = HTMLElement> = Omit<
  HTMLMotionProps<keyof HTMLElementTagNameMap>,
  'ref'
> & { ref?: React.Ref<T> };

type WithAsChild<Base extends object> =
  | (Base & { asChild: true; children: React.ReactElement })
  | (Base & { asChild?: false | undefined });

type SlotProps<T extends HTMLElement = HTMLElement> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children?: any;
} & DOMMotionProps<T>;

function mergeProps<T extends HTMLElement>(
  childProps: AnyProps,
  slotProps: DOMMotionProps<T>,
): AnyProps {
  const merged: AnyProps = { ...childProps, ...slotProps };

  if (childProps.className || slotProps.className) {
    merged.className = cn(
      childProps.className as string,
      slotProps.className as string,
    );
  }

  if (childProps.style || slotProps.style) {
    merged.style = {
      ...(childProps.style as React.CSSProperties),
      ...(slotProps.style as React.CSSProperties),
    };
  }

  return merged;
}

/**
 * `forwardRef` rather than reading `ref` out of props.
 *
 * Upstream animate-ui targets React 19, where `ref` is an ordinary prop. This
 * project is on React 18, where React intercepts `ref` and never places it in
 * props — so the destructured `ref` was always `undefined`, React logged both
 * "Function components cannot be given refs" and "`ref` is not a prop", and
 * every ref aimed at a Slot was silently dropped.
 *
 * That was not only noise. `AnimateIcon` routes its in-view ref through here,
 * and `TabsTrigger` registers `localRef.current` with the tab indicator so it
 * can measure the active trigger; both got nothing.
 */
const Slot = React.forwardRef<HTMLElement, Omit<SlotProps, 'ref'>>(function Slot({
  children,
  ...props
}, forwardedRef) {
  const isAlreadyMotion =
    typeof children.type === 'object' &&
    children.type !== null &&
    isMotionComponent(children.type);

  const Base = React.useMemo(
    () =>
      isAlreadyMotion
        ? (children.type as React.ElementType)
        : motion.create(children.type as React.ElementType),
    [isAlreadyMotion, children.type],
  );

  if (!React.isValidElement(children)) return null;

  // React 18 keeps `ref` on the element, not in props, and defines a warning
  // getter at `props.ref` — so destructuring it here both logged "`ref` is not
  // a prop" and always yielded undefined, quietly dropping the child's own ref.
  const childProps = children.props as AnyProps;
  const childRef = (children as React.ReactElement & { ref?: React.Ref<HTMLElement> })
    .ref;

  const mergedProps = mergeProps(childProps, props);

  return (
    <Base
      {...mergedProps}
      ref={mergeRefs(childRef, forwardedRef)}
    />
  );
});
Slot.displayName = 'Slot';

export {
  Slot,
  type SlotProps,
  type WithAsChild,
  type DOMMotionProps,
  type AnyProps,
};
