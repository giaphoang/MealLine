// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const brand = vi.hoisted(() => ({
  identity: { organizationName: 'Lift Up' },
  logo: {
    lightSrc: '/light-logo.svg',
    darkSrc: '/dark-logo.svg',
    lightWidth: 1200,
    lightHeight: 360,
    darkWidth: 1000,
    darkHeight: 300,
  },
}));

vi.mock('@/contexts/BrandContext', () => ({ useBrand: () => brand }));

import { BrandLogo } from '@/components/brand-logo';

describe('BrandLogo', () => {
  beforeEach(() => {
    brand.logo.lightSrc = '/light-logo.svg';
    brand.logo.darkSrc = '/dark-logo.svg';
  });

  it('renders distinct light and dark sources for CSS theme selection', () => {
    render(<BrandLogo className="h-20" />);

    const logos = screen.getAllByRole('img', { name: 'Lift Up Logo' });
    expect(logos).toHaveLength(2);
    expect(logos[0]).toHaveAttribute('src', '/light-logo.svg');
    expect(logos[0]).toHaveClass('brand-logo-light', 'h-20');
    expect(logos[0]).toHaveAttribute('width', '1200');
    expect(logos[1]).toHaveAttribute('src', '/dark-logo.svg');
    expect(logos[1]).toHaveClass('brand-logo-dark', 'h-20');
    expect(logos[1]).toHaveAttribute('width', '1000');
  });

  it('renders only once when both theme slots use the same asset', () => {
    brand.logo.darkSrc = brand.logo.lightSrc;
    render(<BrandLogo />);

    expect(screen.getAllByRole('img', { name: 'Lift Up Logo' })).toHaveLength(1);
  });
});
