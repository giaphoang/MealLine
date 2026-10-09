// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import type { ReactNode } from 'react';

import { useBrand } from '@/contexts/BrandContext';
import { cn } from '@/lib/utils';

type BrandLogoProps = {
  alt?: string;
  className?: string;
};

/**
 * The shared logo renderer for every themed identity surface.
 *
 * CSS owns selection so this works in the complete three-state theme model:
 * an explicit `.light`, an explicit `.dark`, and an unstamped root following
 * `prefers-color-scheme`. Rendering both sources also avoids a light-logo flash
 * while JavaScript resolves the device theme.
 */
export function BrandLogo({ alt, className }: BrandLogoProps) {
  const brand = useBrand();
  const label = alt ?? `${brand.identity.organizationName} Logo`;
  const imageClassName = cn('max-w-full object-contain', className);

  /**
   * Plenty of marks are drawn in white on a transparent ground, for placing
   * over photography, and all but disappear on a light page. `dark-surface`
   * gives those their own plate — in light mode only, because in dark mode the
   * page is already the background the mark was drawn for.
   */
  /**
   * The plate is painted by an absolutely positioned backdrop, not by padding
   * on a wrapper.
   *
   * Padding moved the mark: turning the plate on pushed it down and right by
   * the padding, and dropping that padding in dark mode moved it back, so the
   * logo sat in one place in light mode and another in dark. A backdrop must
   * not change where the thing in front of it sits.
   *
   * Cancelling the padding with a negative margin looks like the obvious fix
   * and is not one — `-mx-3`/`-my-2` were never generated, so the correction
   * silently did nothing while reading as though it worked. Taking the plate
   * out of flow entirely cannot fail that way: an absolutely positioned box
   * contributes no size to its parent, so the mark keeps the exact position it
   * has with no plate at all.
   *
   * `isolate` keeps the negative z-index inside this element, so the backdrop
   * sits behind the mark without falling behind an ancestor's background.
   */
  const wrap = (content: ReactNode) =>
    brand.logo.presentation === 'dark-surface' ? (
      <span
        data-logo-presentation="dark-surface"
        className="relative isolate inline-flex items-center justify-center"
      >
        <span
          aria-hidden
          style={{ inset: '-8px -12px', zIndex: -1 }}
          className="pointer-events-none absolute rounded-xl bg-[var(--feed-logo-surface)] dark:hidden"
        />
        {content}
      </span>
    ) : (
      content
    );

  if (brand.logo.lightSrc === brand.logo.darkSrc) {
    return wrap(
      <img
        src={brand.logo.lightSrc}
        alt={label}
        width={brand.logo.lightWidth}
        height={brand.logo.lightHeight}
        style={{ aspectRatio: `${brand.logo.lightWidth} / ${brand.logo.lightHeight}` }}
        className={imageClassName}
      />
    );
  }

  return wrap(
    <>
      <img
        src={brand.logo.lightSrc}
        alt={label}
        width={brand.logo.lightWidth}
        height={brand.logo.lightHeight}
        style={{ aspectRatio: `${brand.logo.lightWidth} / ${brand.logo.lightHeight}` }}
        className={cn('brand-logo-light', imageClassName)}
      />
      <img
        src={brand.logo.darkSrc}
        alt={label}
        width={brand.logo.darkWidth}
        height={brand.logo.darkHeight}
        style={{ aspectRatio: `${brand.logo.darkWidth} / ${brand.logo.darkHeight}` }}
        className={cn('brand-logo-dark', imageClassName)}
      />
    </>
  );
}
