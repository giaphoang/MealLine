// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { resolveSubmittedName } from "@/lib/formatting/text"
import { StatusFlagsGroup, DietaryFlagsGroup } from './components'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { useEffect, useState } from "react"
import { StatusFlags, DietaryFlags, FoodItemSupply, type FoodItemFulfilment } from "@/types/food-item"
import { Category } from "@/types/category"
import { useCategoryContext } from "@/contexts/CategoryContext"
import { useFoodForm } from "@/hooks/food-item/form/useFoodForm"
import { useSupplyForm } from "@/hooks/food-item/form/useSupplyForm"
import { useMessage } from "@/hooks/message/useMessage"
import { useStatusFlags } from "@/hooks/food-item/form/flags"

interface FoodItemFormProps {
  onSubmit: (data: {
    name: string;
    limit: number;
    limitType: 'person' | 'household';
    categoryId: number;
    statusFlags: StatusFlags;
    dietaryFlags: DietaryFlags;
    supply: FoodItemSupply;
    fulfilment?: FoodItemFulfilment;
  }) => Promise<void>;
  error?: { message: string } | null;
  isSaving?: boolean;
  initialLimit?: string;
  initialLimitType?: 'person' | 'household';
  initialName?: string;
  initialCategoryId?: string;
  initialStatusFlags?: StatusFlags;
  initialDietaryFlags?: DietaryFlags;
  initialSupply?: FoodItemSupply;
  initialFulfilment?: FoodItemFulfilment;
  onCancel?: () => void;
}

export function FoodItemForm({ 
  onSubmit, 
  error, 
  isSaving = false,
  initialLimit,
  initialLimitType = 'household',
  initialName = '',
  initialCategoryId = '',
  initialStatusFlags,
  initialDietaryFlags,
  initialSupply,
  initialFulfilment,
  onCancel
}: FoodItemFormProps) {
  const [fulfilment, setFulfilment] = useState<FoodItemFulfilment>(initialFulfilment ?? { quantity: 0, unit: 'unit', requiresStove: false, requiresFridge: false });
  const {
    name,
    limit,
    limitType,
    categoryId,
    status,
    dietaryFlags,
    showValidation,
    validationError,
    handleNameChange,
    handleLimitChange,
    handleLimitTypeChange,
    handleCategoryChange,
    handleDietaryFlagChange,
    resetForm,
    validateForm,
    getFormattedLimit
  } = useFoodForm(initialLimit, initialLimitType, initialName, initialCategoryId, initialDietaryFlags);

  const {
    flags: statusFlags,
    handleFlagChange: handleStatusFlagsChange,
    validateFlags,
    reset: resetStatusFlags,
    error: statusError
  } = useStatusFlags(initialStatusFlags);

  const {
    quantityText,
    supplySource,
    handleQuantityChange,
    handleSupplySourceChange,
    resetSupply,
    getSupplyPayload
  } = useSupplyForm(initialSupply);

  const handleFormReset = () => {
    resetForm();
    resetStatusFlags();
    resetSupply();
  };

  const { categories, isLoading: isCategoriesLoading } = useCategoryContext();
  const { showMessage } = useMessage();

  useEffect(() => {
    // Watch for external errors
    if (error) {
      showMessage(error.message, 'error');
    }

    // Watch for validation errors
    if (validationError && showValidation) {
      showMessage(validationError, 'error');
    }
  }, [error, validationError, showValidation, showMessage]);

  const numberOptions = Array.from({ length: 100 }, (_, i) => (i + 1).toString())
  const limitOptions = ['no-limit', ...numberOptions]

  const handleSubmit = async () => {
    if (!Number.isSafeInteger(fulfilment.quantity) || fulfilment.quantity < 0 || fulfilment.quantity > 2147483647 || !fulfilment.unit.trim()) {
      showMessage('Enter a nonnegative whole-number quantity and a unit on the Fulfilment tab.', 'error');
      return;
    }
    if (!validateForm()) {
      return;
    }

    if (!validateFlags()) {
      showMessage(statusError || 'Invalid status configuration', 'error');
      return;
    }

    try {
      const submitData = {
        // Title-Case enforcement happens here at submit, not per keystroke,
        // so the caret stays put while typing/editing (ISSUES.md #38). An
        // untouched name is submitted verbatim so the edit dialog does not
        // mistake reformatting for a rename.
        name: resolveSubmittedName(name, initialName),
        limit: getFormattedLimit(),
        limitType,
        categoryId: parseInt(categoryId, 10),
        statusFlags,
        dietaryFlags,
        supply: getSupplyPayload(),
        ...(!initialFulfilment || Object.keys(fulfilment).some((key) => fulfilment[key as keyof FoodItemFulfilment] !== initialFulfilment[key as keyof FoodItemFulfilment]) ? { fulfilment } : {}),
      };

      await onSubmit(submitData);
      handleFormReset();
    } catch (err) {
      console.error('FoodItemForm - Error:', err);
      // Don't show success message here - let the parent component handle messages
      // based on the actual success/failure of the operation
    }
  }

  const getDisplayValue = (value: string) => {
    return value === 'no-limit' ? 'No Limit' : value
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="basic" className="w-full">
        <div className="min-h-[420px]">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="dietary">Dietary</TabsTrigger>
          <TabsTrigger value="supply">Supply</TabsTrigger>
          <TabsTrigger value="fulfilment">Fulfilment</TabsTrigger>
        </TabsList>

        <TabsContents className="px-1 pb-2 pt-1">
        <TabsContent value="fulfilment" className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">Exact stock used by MealLine household matching. Packing a basket deducts these units. This is separate from FEED's optional estimated Supply annotation.</p>
          <div className="space-y-2">
            <Label htmlFor="fulfilment-quantity">Available units</Label>
            <Input id="fulfilment-quantity" type="number" min="0" step="1" value={fulfilment.quantity} disabled={isSaving} onChange={(event) => setFulfilment({ ...fulfilment, quantity: Number(event.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fulfilment-unit">Unit</Label>
            <Input id="fulfilment-unit" value={fulfilment.unit} maxLength={80} disabled={isSaving} onChange={(event) => setFulfilment({ ...fulfilment, unit: event.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="fulfilment-stove" checked={fulfilment.requiresStove} disabled={isSaving} onCheckedChange={(checked) => setFulfilment({ ...fulfilment, requiresStove: checked })} />
            <Label htmlFor="fulfilment-stove">Requires a stove</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="fulfilment-fridge" checked={fulfilment.requiresFridge} disabled={isSaving} onCheckedChange={(checked) => setFulfilment({ ...fulfilment, requiresFridge: checked })} />
            <Label htmlFor="fulfilment-fridge">Requires a refrigerator</Label>
          </div>
        </TabsContent>
        <TabsContent value="basic" className="space-y-4">
          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={handleNameChange}
              disabled={isSaving}
              placeholder="Enter food item name..."
              maxLength={36}
              className={showValidation && validationError ? 'border-destructive' : ''}
            />
          </div>

          {/* Category Select */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={categoryId}
              onValueChange={handleCategoryChange}
              disabled={isSaving || isCategoriesLoading}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {(categories || []).map((category: Category) => (
                  <SelectItem key={category.id} value={category.id.toString()}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Item Limit */}
          <div className="space-y-2">
            <Label htmlFor="limit">Item Limit</Label>
            <Select
              value={limit}
              onValueChange={handleLimitChange}
              disabled={isSaving}
            >
              <SelectTrigger id="limit">
                <SelectValue>{getDisplayValue(limit)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {limitOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {getDisplayValue(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Limit Type */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 pt-2">
              <Switch 
                id="limit-type"
                checked={limitType === 'person'}
                onCheckedChange={handleLimitTypeChange}
                disabled={isSaving}
              />
              <Label htmlFor="limit-type" className="text-sm font-medium">
                {limitType === 'person' ? 'Per Person' : 'Per Household'}
              </Label>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="status" className="py-2">
          <div className="space-y-4">
            <StatusFlagsGroup
              value={statusFlags}
              onChange={handleStatusFlagsChange}
              disabled={isSaving}
            />
          </div>
        </TabsContent>

        <TabsContent value="dietary" className="py-2">
          <div className="space-y-4">
            <DietaryFlagsGroup
              value={dietaryFlags}
              onChange={handleDietaryFlagChange}
              disabled={isSaving}
            />
          </div>
        </TabsContent>

        <TabsContent value="supply" className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="estimated-quantity">Estimated Quantity</Label>
            <Input
              id="estimated-quantity"
              inputMode="numeric"
              value={quantityText}
              onChange={(e) => handleQuantityChange(e.target.value)}
              disabled={isSaving}
              placeholder="Unknown"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supply-source">Source</Label>
            <div className="flex items-center gap-2">
              <Select
                value={supplySource ?? undefined}
                onValueChange={handleSupplySourceChange}
                disabled={isSaving}
              >
                <SelectTrigger id="supply-source" className="flex-1">
                  <SelectValue placeholder="Unknown" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="donated">Donated</SelectItem>
                  <SelectItem value="purchased">Purchased</SelectItem>
                  <SelectItem value="mixed_other">Mixed/Other</SelectItem>
                </SelectContent>
              </Select>
              {supplySource !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSupplySourceChange('unknown')}
                  disabled={isSaving}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </TabsContent>
        </TabsContents>
        </div>
      </Tabs>

      <div className="flex justify-end gap-4">
        <Button 
          variant="ghost" 
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : initialName ? 'Update Food Item' : 'Add Food Item'}
        </Button>
      </div>
    </div>
  )
}
