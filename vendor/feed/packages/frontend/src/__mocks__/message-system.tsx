// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { vi } from 'vitest';

export const mockMessageService = {
  error: vi.fn(),
  show: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  retryableError: vi.fn(),
  systemError: vi.fn()
};

vi.mock('@/services/message', () => ({
  messageService: mockMessageService
}));

export const mockShowError = mockMessageService.error;

export const useMessage = () => ({
  showError: (message: string) => mockMessageService.error(message)
});

export const verifyToastMessage = (message: string, type?: 'success' | 'error' | 'info') => {
  if (type === 'error') {
    expect(mockShowError).toHaveBeenCalledWith(message, undefined);
  }
};

export const resetMessageMock = () => {
  mockShowError.mockClear();
};
