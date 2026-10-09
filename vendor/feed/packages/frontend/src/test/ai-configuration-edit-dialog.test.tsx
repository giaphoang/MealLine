// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom
import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditAIModelDialog } from '@/components/ai-configuration/EditAIModelDialog';
import type { AIConfiguration } from '@/components/ai-configuration/types';

vi.mock('@/hooks/message/useMessage', () => ({
  useMessage: () => ({
    showMessage: vi.fn(),
    showError: vi.fn()
  })
}));

// These two tests render the real wizard and click through the service step,
// which now fetches the model catalogue. Nothing in `src/test/setup.ts` stubs
// `fetch`, and Node's global one is real under jsdom — so without this the
// suite would attempt an actual connection to localhost on every run. An empty
// catalogue is a valid state: the step falls back to free-text inputs, so
// navigation still works and these assertions stay about the API key and cost
// fields they were written for.
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ models: [], endpoints: {} })
  })
);

describe('EditAIModelDialog', () => {
  test('offers the API key as an editable, hidden-value field', () => {
    // Edit used to render a disabled box of bullets and tell the administrator
    // to create a new configuration to change the key. The field is editable
    // now, and the placeholder has to read as "deliberately hidden" rather than
    // "nothing here" — see docs/data-management/beta-6-backup-restore-brief.md.
    const config: AIConfiguration = {
      id: 3,
      name: 'OpenAI Test',
      type: 'apikey',
      value: '',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      serviceType: 'OpenAI',
      model: 'gpt-4',
      modelName: 'gpt-4'
    };

    render(
      <EditAIModelDialog
        open
        configuration={config}
        onOpenChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;

    expect(apiKey.disabled).toBe(false);
    expect(apiKey.type).toBe('password');
    expect(apiKey.value).toBe('');
    expect(apiKey.placeholder).toBe('••••••••••••');

    fireEvent.change(apiKey, { target: { value: 'sk-new-key' } });
    expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('sk-new-key');
  });

  test('preserves cost inputs across parent re-renders', () => {
    const config: AIConfiguration = {
      id: 1,
      name: 'Gemini Test',
      type: 'apikey',
      value: '',
      description: 'Test config',
      isActive: true,
      createdAt: '2025-12-24T00:00:00.000Z',
      updatedAt: '2025-12-24T00:00:00.000Z',
      serviceType: 'Google',
      model: 'gemini-2.5-flash-lite',
      modelName: 'gemini-2.5-flash-lite',
      endpointUrl: 'https://generativelanguage.googleapis.com',
      inputCost: null,
      outputCost: null,
      unitPrice: 'per_1m',
      temperature: 0.7,
      topP: 1,
      maxTokens: null,
      tokensPerMinute: null,
      requestsPerMinute: null,
      requestsPerDay: null
    };

    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleOpenChange = vi.fn();

    const { rerender } = render(
      <EditAIModelDialog
        open
        configuration={config}
        onOpenChange={handleOpenChange}
        onSave={handleSave}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    const inputRate = screen.getByLabelText('Input Rate') as HTMLInputElement;
    const outputRate = screen.getByLabelText('Output Rate') as HTMLInputElement;

    fireEvent.change(inputRate, { target: { value: '0.1' } });
    fireEvent.change(outputRate, { target: { value: '0.4' } });

    expect(inputRate.value).toBe('0.1');
    expect(outputRate.value).toBe('0.4');

    rerender(
      <EditAIModelDialog
        open
        configuration={config}
        onOpenChange={handleOpenChange}
        onSave={handleSave}
        isLoading
      />
    );

    const inputRateAfter = screen.getByLabelText('Input Rate') as HTMLInputElement;
    const outputRateAfter = screen.getByLabelText('Output Rate') as HTMLInputElement;

    expect(inputRateAfter.value).toBe('0.1');
    expect(outputRateAfter.value).toBe('0.4');
  });
});
