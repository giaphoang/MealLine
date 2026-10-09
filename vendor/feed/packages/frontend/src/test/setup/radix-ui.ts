// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { vi } from 'vitest';

beforeAll(() => {
  // Scroll behavior mocks
  Element.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  
  // Pointer event mocks
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  
  // Dialog focus management mocks
  window.HTMLElement.prototype.focus = vi.fn();
  window.HTMLElement.prototype.blur = vi.fn();
  
  // ResizeObserver mock
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});
