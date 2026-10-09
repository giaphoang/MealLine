// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { afterEach, describe, expect, it } from 'vitest';
import {
  CARBON_CATEGORICAL_ORDER,
  carbonCategoricalFamilies,
  carbonCategoricalTheme,
  carbonTheme,
  getChartStatusColor,
  setCarbonCategoricalOrder,
} from '@/lib/colors';

describe('runtime Carbon chart order', () => {
  afterEach(() => setCarbonCategoricalOrder(CARBON_CATEGORICAL_ORDER));

  it('uses the server-proven rotation while keeping the Carbon colors intact', () => {
    const tealFirst = [
      'teal', 'orange', 'purple', 'green', 'yellow',
      'cyan', 'red', 'warmGray', 'blue', 'magenta',
    ];
    setCarbonCategoricalOrder(tealFirst);
    expect(carbonCategoricalFamilies()).toEqual(tealFirst);
    expect(carbonCategoricalTheme(0)).toEqual(carbonTheme('teal'));
    expect(carbonCategoricalTheme(1)).toEqual(carbonTheme('orange'));
  });

  it('refuses malformed orders instead of losing a family or accessibility grade', () => {
    setCarbonCategoricalOrder(['teal']);
    expect(carbonCategoricalFamilies()).toEqual(CARBON_CATEGORICAL_ORDER);
  });

  it('never changes semantic status colors when the organization brand changes', () => {
    const dangerBefore = getChartStatusColor('error', 'light');
    setCarbonCategoricalOrder([...CARBON_CATEGORICAL_ORDER].reverse());
    expect(getChartStatusColor('error', 'light')).toBe(dangerBefore);
  });
});
