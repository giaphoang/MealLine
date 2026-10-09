// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
} from "@/components/ui/select";
import { GlobeLock } from "@/components/ui/icons";
import { useMessage } from "@/hooks/message/useMessage";
import { GlobalLimitService } from "@/services/global-limit";

// Create singleton instance
const globalLimitService = new GlobalLimitService();

interface GlobalLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalLimitDialog({ open, onOpenChange }: GlobalLimitDialogProps) {
  const [globalLimit, setGlobalLimit] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { showMessage } = useMessage();

  // Generate array of numbers 1-100
  const options = Array.from({ length: 100 }, (_, i) => (i + 1).toString());

  // Fetch initial global limit when dialog opens
  useEffect(() => {
    if (open) {
      fetchGlobalLimit();
    }
  }, [open]);

  const fetchGlobalLimit = async () => {
    setIsLoading(true);
    try {
      const limit = await globalLimitService.getGlobalLimit();
      setGlobalLimit(limit.toString());
    } catch (error) {
      console.error('Failed to fetch global limit:', error);
      showMessage(
        error instanceof Error 
          ? error.message 
          : 'Failed to fetch current limit. Please try again.',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleValueChange = (value: string) => {
    setGlobalLimit(value);
  };

  const handleSubmit = async () => {
    if (!globalLimit) {
      showMessage('Please select a value', 'error');
      return;
    }

    setIsSaving(true);
    showMessage('Updating global limit...', 'info');

    try {
      const updatedLimit = await globalLimitService.updateGlobalLimit(parseInt(globalLimit, 10));
      setGlobalLimit(updatedLimit.toString());
      showMessage('Global limit successfully updated', 'success');
      onOpenChange(false); // Close dialog on success
    } catch (error) {
      console.error('Failed to update global limit:', error);
      showMessage(
        error instanceof Error 
          ? error.message 
          : 'Failed to update global limit. Please try again.',
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="global-limit-dialog">
        <DialogHeader>
          <DialogTitle>Global Limit Settings</DialogTitle>
          <DialogDescription>
            Set upper limit for all food items marked as "No Limit."
            Clients will not be allowed to request more than this amount.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {isLoading ? (
            <div className="h-10 w-full animate-pulse bg-muted rounded-md"></div>
          ) : (
            <Select
              value={globalLimit}
              onValueChange={handleValueChange}
              name="global-limit"
            >
              <SelectTrigger className="w-full" disabled={isSaving}>
                <SelectValue placeholder="Select a limit..." />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Choose a Global Limit</SelectLabel>
                  {options.map((value) => (
                    <SelectItem
                      key={value}
                      value={value}
                    >
                      {value}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </div>
        
        <DialogFooter className="sm:justify-between space-y-4 sm:space-y-0 flex flex-col-reverse gap-4 sm:flex-row sm:gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isSaving || isLoading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSaving || isLoading || !globalLimit}
          >
            {isSaving ? 'Saving...' : 'Save Global Limit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}