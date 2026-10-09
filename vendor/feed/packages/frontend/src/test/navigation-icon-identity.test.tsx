// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import {
  AdminNavIcon,
  ReportsNavIcon,
  ServiceLogNavIcon,
  ShoppingListsNavIcon,
} from '@/components/layout/animated-nav-icons';
import { createPageTitleIcon } from '@/components/layout/page-title-icon';
import { ClipboardPenIcon } from '@/components/ui/clipboard-pen';
import { FileChartPieIcon } from '@/components/ui/file-chart-pie';
import { ShieldUserIcon } from '@/components/ui/shield-user';
import { UsersRoundIcon } from '@/components/ui/users-round';

const iconPaths = (container: HTMLElement) =>
  [...container.querySelectorAll('path')].map((path) => path.getAttribute('d'));

describe('sidebar and page icon identities', () => {
  test.each([
    {
      TitleIcon: FileChartPieIcon,
      NavIcon: ReportsNavIcon,
      paths: [
        'M14 2v4a2 2 0 0 0 2 2h4',
        'M16 22h2a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3.5',
        'M4.017 11.512a6 6 0 1 0 8.466 8.475',
        'M9 16a1 1 0 0 1-1-1v-4c0-.552.45-1.008.995-.917a6 6 0 0 1 4.922 4.922c.091.544-.365.995-.917.995z',
      ],
    },
    {
      TitleIcon: ClipboardPenIcon,
      NavIcon: ShoppingListsNavIcon,
      paths: [
        'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5.5',
        'M4 13.5V6a2 2 0 0 1 2-2h2',
        'M13.378 15.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z',
      ],
    },
    {
      TitleIcon: UsersRoundIcon,
      NavIcon: ServiceLogNavIcon,
      paths: [
        'M18 21a8 8 0 0 0-16 0',
        'M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3',
      ],
    },
    {
      TitleIcon: ShieldUserIcon,
      NavIcon: AdminNavIcon,
      paths: [
        'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
        'M6.376 18.91a6 6 0 0 1 11.249.003',
      ],
    },
  ])('keeps exact geometry and established sizing in titles and navigation', ({
    TitleIcon,
    NavIcon,
    paths,
  }) => {
    const PageTitleIcon = createPageTitleIcon(TitleIcon);
    const titleRender = render(<PageTitleIcon className="h-6 w-6 mt-1 shrink-0" />);
    expect(titleRender.container.firstElementChild).toHaveClass('h-6', 'w-6', 'mt-1', 'shrink-0');
    expect(titleRender.container.querySelector('svg')).toHaveAttribute('width', '28');
    expect(titleRender.container.querySelector('svg')).toHaveAttribute('height', '28');
    expect(iconPaths(titleRender.container)).toEqual(paths);
    titleRender.unmount();

    const navRender = render(<NavIcon />);
    expect(iconPaths(navRender.container)).toEqual(paths);
  });
});
