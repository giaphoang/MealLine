// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { useState } from 'react';
import {
  DEFAULT_SUPPLY,
  FoodItemSupply,
  SupplySource,
} from '@/types/food-item';

interface SupplyFormState {
  quantityText: string;
  supplySource: SupplySource | null;
}

const WHOLE_NUMBER_PATTERN = /^\d*$/;

const toInitialState = (initial?: FoodItemSupply): SupplyFormState => {
  const source = initial ?? DEFAULT_SUPPLY;
  return {
    quantityText:
      source.estimatedQuantity === null ? '' : String(source.estimatedQuantity),
    supplySource: source.supplySource,
  };
};

/** State for the optional Food Item Supply tab. */
export function useSupplyForm(initialSupply?: FoodItemSupply) {
  const [state, setState] = useState<SupplyFormState>(() =>
    toInitialState(initialSupply)
  );

  const handleQuantityChange = (value: string) => {
    if (WHOLE_NUMBER_PATTERN.test(value) && value.length <= 9) {
      setState((current) => ({ ...current, quantityText: value }));
    }
  };

  const handleSupplySourceChange = (value: string) => {
    if (value === 'unknown') {
      setState((current) => ({ ...current, supplySource: null }));
      return;
    }
    if (value === 'donated' || value === 'purchased' || value === 'mixed_other') {
      setState((current) => ({ ...current, supplySource: value }));
    }
  };

  const resetSupply = () => setState(toInitialState());

  const getSupplyPayload = (): FoodItemSupply => ({
    estimatedQuantity:
      state.quantityText.trim() === ''
        ? null
        : parseInt(state.quantityText, 10),
    supplySource: state.supplySource,
  });

  return {
    quantityText: state.quantityText,
    supplySource: state.supplySource,
    handleQuantityChange,
    handleSupplySourceChange,
    resetSupply,
    getSupplyPayload,
  };
}
