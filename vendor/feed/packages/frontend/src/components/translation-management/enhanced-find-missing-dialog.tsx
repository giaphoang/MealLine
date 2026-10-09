// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Search, AlertTriangle, CheckCircle, Circle, RefreshCw, Trash2, FileSearch, XCircle, CheckCircle2 } from "@/components/ui/icons";
import { useMessage } from '@/hooks/message/useMessage';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { TranslationType } from '@/types/translation';

interface FindMissingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFindMissing: () => Promise<{ count: number; message: string; details?: MissingTranslationDetails; staleCount?: number }>;
  onProcessSelected?: (types: TranslationType[]) => Promise<{ count: number; message: string }>;
  onBulkRetry?: (types: TranslationType[]) => Promise<any>;
  onBulkDelete?: (types: TranslationType[]) => Promise<any>;
  isLoading: boolean;
  translations: Array<{ type: TranslationType; status: string; createdAt?: Date }>;
}

interface CategoryCount {
  type: TranslationType;
  count: number;
  displayName: string;
  icon: React.ReactNode;
}

interface LanguageCount {
  language: string;
  displayName: string;
  count: number;
}

interface MissingTranslationDetails {
  byType: {
    [key in TranslationType]?: number;
  };
  byLanguage: {
    [key: string]: number;
  };
  totalItems: number;
  sampleItems?: {
    [key in TranslationType]?: string[];
  };
}

export function EnhancedFindMissingDialog({
  open,
  onOpenChange,
  onFindMissing,
  onProcessSelected,
  onBulkRetry,
  onBulkDelete,
  isLoading,
  translations,
}: FindMissingDialogProps) {
  // Constants
  const PENDING_TIMEOUT_MS = 60 * 1000; // 1 minute in milliseconds
  
  // State
  const { showMessage } = useMessage();
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ count: number; message: string; details?: MissingTranslationDetails; staleCount?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedTypes, setSelectedTypes] = useState<{[key in TranslationType]?: boolean}>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<'process' | 'retry' | 'delete' | null>(null);
  const [hasMissingTranslations, setHasMissingTranslations] = useState(false);
  const [hasFailedTranslations, setHasFailedTranslations] = useState(false);
  const [hasStaleTranslations, setHasStaleTranslations] = useState(false);

  // Derived: count of queueable missing items (excludes both 'Generated' --
  // handled by the Document Translator -- and 'Generated (List)' -- filled
  // by the Shopping List Builder's per-template Translate & Download PDF
  // flow). Only FoodItem, Category, and Custom can be queued from here.
  const queueableMissingCount = (() => {
    const byType = result?.details?.byType as any;
    if (!byType) return 0;
    return (byType.FoodItem || 0) + (byType.Category || 0) + (byType.Custom || 0);
  })();

  // Helper functions
  const getSelectedTypesArray = () => {
    return Object.entries(selectedTypes)
      .filter(([_, isSelected]) => isSelected)
      .map(([type]) => type as TranslationType);
  };
  
  const checkHasFailedTranslations = () => {
    if (!translations) return false;
    const selectedTypesArray = getSelectedTypesArray();
    
    return translations.some(translation => 
      selectedTypesArray.includes(translation.type) && 
      translation.status === 'failed'
    );
  };
  
  const countFailedTranslations = () => {
    if (!translations) return 0;
    const selectedTypesArray = getSelectedTypesArray();
    
    return translations.filter(translation => 
      selectedTypesArray.includes(translation.type) && 
      translation.status === 'failed'
    ).length;
  };
  
  const checkHasStaleTranslations = () => {
    if (!translations) return false;
    const selectedTypesArray = getSelectedTypesArray();
    const now = new Date().getTime();
    
    return translations.some(translation => 
      selectedTypesArray.includes(translation.type) && 
      translation.status === 'pending' &&
      translation.createdAt && 
      (now - new Date(translation.createdAt).getTime() > PENDING_TIMEOUT_MS)
    );
  };
  
  const checkHasMissingTranslations = () => {
    if (!result?.details) return false;
    const totalMissingCount = result.count;
    const failedCount = countFailedTranslations();
    
    // If total missing > failed count, there must be truly missing ones
    return totalMissingCount > failedCount;
  };
  
  // Define type categories with icons
  const getTypeCounts = (): CategoryCount[] => {
    if (!result?.details) return [];
    
    return [
      { 
        type: 'FoodItem',
        count: result.details.byType.FoodItem || 0,
        displayName: 'Food Items',
        icon: <Circle className="h-4 w-4 text-[var(--status-success-border)]" />
      },
      { 
        type: 'Category',
        count: result.details.byType.Category || 0,
        displayName: 'Categories',
        icon: <Circle className="h-4 w-4 text-[var(--status-warning-border)]" />
      },
      { 
        type: 'Custom',
        count: result.details.byType.Custom || 0,
        displayName: 'Custom Texts',
        icon: <Circle className="h-4 w-4 text-[var(--status-danger-border)]" />
      },
      {
        type: 'Generated',
        count: result.details.byType.Generated || 0,
        displayName: 'Generated (Document)',
        icon: <Circle className="h-4 w-4 text-[var(--status-neutral-border)]" />
      },
      {
        type: 'Generated (List)',
        count: result.details.byType['Generated (List)'] || 0,
        displayName: 'Generated (Shopping List)',
        icon: <Circle className="h-4 w-4 text-[var(--status-neutral-border)]" />
      }
    ];
  };

  // Get language counts
  const getLanguageCounts = (): LanguageCount[] => {
    if (!result?.details?.byLanguage) return [];
    
    return Object.entries(result.details.byLanguage).map(([language, count]) => {
      return {
        language,
        displayName: language, // Language is already a full name
        count
      };
    }).sort((a, b) => b.count - a.count);
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      setProgress(0);
      setActiveTab('overview');
      setSelectedTypes({});
      setHasMissingTranslations(false);
      setHasFailedTranslations(false);
      setHasStaleTranslations(false);
    }
  }, [open]);

  // Update state based on selection and result
  useEffect(() => {
    if (result) {
      setHasFailedTranslations(checkHasFailedTranslations());
      setHasMissingTranslations(checkHasMissingTranslations());
      setHasStaleTranslations(checkHasStaleTranslations());
    }
  }, [result, selectedTypes, translations]);

  // Simulate progress during the search
  useEffect(() => {
    if (isSearching) {
      // Different phases of the scanning process
      const phases = [
        { targetProgress: 20, interval: 150, description: "Scanning food items..." },
        { targetProgress: 40, interval: 200, description: "Scanning categories..." },
        { targetProgress: 55, interval: 250, description: "Scanning custom texts..." },
        { targetProgress: 75, interval: 300, description: "Scanning document translations..." },
        { targetProgress: 88, interval: 300, description: "Scanning shopping list templates..." },
        { targetProgress: 95, interval: 400, description: "Finalizing results..." }
      ];
      
      let currentPhaseIndex = 0;
      let currentProgress = 0;
      
      const updateProgress = () => {
        if (!isSearching) return;
        
        const currentPhase = phases[currentPhaseIndex];
        
        if (currentProgress < currentPhase.targetProgress) {
          currentProgress += 1;
          setProgress(currentProgress);
          setTimeout(updateProgress, currentPhase.interval);
        } else if (currentPhaseIndex < phases.length - 1) {
          // Move to next phase
          currentPhaseIndex++;
          setTimeout(updateProgress, phases[currentPhaseIndex].interval);
        }
      };
      
      // Start the progress simulation
      updateProgress();
      
      return () => {};
    } else if (result) {
      // Set to 100% when finished with success
      setProgress(100);
    }
  }, [isSearching, result]);

  // Handlers
  const handleFindMissing = async () => {
    setIsSearching(true);
    setResult(null);
    setError(null);
    setProgress(0);
    setSelectedTypes({});

    try {
      const searchResult = await onFindMissing();
      setResult(searchResult);
      
      // Initialize all found types as selected
      if (searchResult.details?.byType) {
        const initialSelections: {[key in TranslationType]?: boolean} = {};
        const selectedTypesArray: TranslationType[] = [];
        
        Object.entries(searchResult.details.byType).forEach(([type, count]) => {
          // Do not preselect 'Generated' (handled by Document Translator) or
          // 'Generated (List)' (handled by the Shopping List Builder's
          // per-template Translate & Download PDF flow) -- neither is
          // queueable from this dialog.
          if (count > 0 && type !== 'Generated' && type !== 'Generated (List)') {
            initialSelections[type as TranslationType] = true;
            selectedTypesArray.push(type as TranslationType);
          }
        });
        setSelectedTypes(initialSelections);
        
        // Check for failed translations
        const hasFailedTranslations = translations.some(translation => 
          selectedTypesArray.includes(translation.type) && 
          translation.status === 'failed'
        );
        setHasFailedTranslations(hasFailedTranslations);
        
        // Check for stale translations
        const now = new Date().getTime();
        const hasStaleTranslations = translations.some(translation => 
          selectedTypesArray.includes(translation.type) && 
          translation.status === 'pending' &&
          translation.createdAt && 
          (now - new Date(translation.createdAt).getTime() > PENDING_TIMEOUT_MS)
        );
        setHasStaleTranslations(hasStaleTranslations);
        
        // Check for missing translations
        const failedCount = translations.filter(translation => 
          selectedTypesArray.includes(translation.type) && 
          translation.status === 'failed'
        ).length;
        const hasMissingTranslations = searchResult.count > failedCount;
        setHasMissingTranslations(hasMissingTranslations);
        
        // Log stale count if available
        if (searchResult.staleCount) {
          console.log(`Found ${searchResult.staleCount} stale pending translations`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find missing translations');
    } finally {
      setIsSearching(false);
    }
  };

  const handleProcessTranslations = async () => {
    if (!onProcessSelected) return;
    
    const typesToProcess = getSelectedTypesArray();
    
    if (typesToProcess.length === 0) {
      showMessage('Please select at least one type to process', 'warning');
      return;
    }
    
    try {
      setIsProcessing(true);
      setProcessingAction('process');
      const processResult = await onProcessSelected(typesToProcess);
      showMessage(processResult.message, 'success');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to process translations', 'error');
    } finally {
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };

  const handleRetryTranslations = async () => {
    if (!onBulkRetry) return;
    
    const typesToRetry = getSelectedTypesArray();
    
    if (typesToRetry.length === 0) {
      showMessage('Please select at least one type to retry', 'warning');
      return;
    }
    
    try {
      setIsProcessing(true);
      setProcessingAction('retry');
      await onBulkRetry(typesToRetry);
      showMessage(`Successfully queued selected translations for retry`, 'success');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to retry translations', 'error');
    } finally {
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };
  
  const handleDeleteTranslations = async () => {
    if (!onBulkDelete) return;
    
    const typesToDelete = getSelectedTypesArray();
    
    if (typesToDelete.length === 0) {
      showMessage('Please select at least one type to delete', 'warning');
      return;
    }
    
    try {
      setIsProcessing(true);
      setProcessingAction('delete');
      await onBulkDelete(typesToDelete);
      showMessage(`Successfully deleted selected translations`, 'success');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to delete translations', 'error');
    } finally {
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };

  const handleClose = (open: boolean) => {
    if (!isSearching && !isProcessing && !open) {
      onOpenChange(open);
      setResult(null);
      setError(null);
      setProgress(0);
      setActiveTab('overview');
      setSelectedTypes({});
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] h-auto min-h-[85vh] max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Find Missing Translations</DialogTitle>
          <DialogDescription>
            {!result 
              ? 'Scan your content to find and queue missing translations'
              : result.count > 0
                ? `Found ${result.count} missing translations that need attention`
                : 'All content is fully translated in all enabled languages'
            }
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          /* Pre-scan state */
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-4 p-4 pt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">What this will do</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <Search className="h-4 w-4 mt-0.5 text-amber-500 dark:text-amber-400 shrink-0" />
                      <span className="text-sm">Find food items, categories, and custom texts missing translations</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <FileSearch className="h-4 w-4 mt-0.5 text-amber-500 dark:text-amber-400 shrink-0" />
                      <span className="text-sm">Discover missing document translations for enabled languages</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <XCircle className="h-4 w-4 mt-0.5 text-red-500 dark:text-red-400 shrink-0" />
                      <span className="text-sm">Find failed translations that need attention</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 dark:text-green-400 shrink-0" />
                      <span className="text-sm">Choose how to handle each type of missing translation</span>
                    </div>
                  </CardContent>
                </Card>

                {isSearching && (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-sm">
                      <span>Scanning for missing translations...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}

                <p className="text-sm text-muted-foreground">
                  This process will scan all content in the system and find any missing translations for currently enabled languages.
                </p>
              </div>
            </ScrollArea>
          </div>
        ) : (
          /* Post-scan state with results */
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="overview">
                Overview
                {result.count > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {result.count}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="languages">Languages</TabsTrigger>
            </TabsList>

            <TabsContents className="flex-1 min-h-0">
            <TabsContent value="overview" className="flex-1 min-h-0 overflow-hidden">
              {/* Definite height (not max-h) so the Radix ScrollArea viewport
                  is bounded and scrolls inside the animate-ui auto-height
                  TabsContents wrapper. See ISSUES.md #30 / #29a. */}
              <ScrollArea className="h-[calc(85vh-13rem)]">
                <div className="flex flex-col gap-4 p-4">
                  {/* Action/results card is rendered FIRST so the actionable
                      content (and its buttons) is immediately visible; the
                      category-count grid follows below. See ISSUES.md #30. */}
                  {/* Only show Missing Translations card if truly missing translations (not just failed or stale) */}
                  {(hasMissingTranslations && !hasStaleTranslations && queueableMissingCount > 0) ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Missing Translations Found</CardTitle>
                        <CardDescription>
                          {result.count} translations need attention
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-[color-mix(in_oklab,var(--status-warning-bg)_40%,transparent)] flex items-center justify-center">
                            <Search className="h-5 w-5 text-[var(--status-warning-border)]" />
                          </div>
                          <div>
                            <p className="text-[var(--status-warning-text)] font-medium">
                              Missing translations were found
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Select which categories to process using the checkboxes below,
                              then choose an action below.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="border-t pt-4 flex flex-col items-start gap-4">
                        <div className="text-sm w-full">
                          <p>
                            Choose how to handle translation issues:
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-3 w-full">
                          <TooltipProvider>
                            {/* Queue for Translation button */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex-1"> {/* Wrapper to capture hover events */}
                                  <Button 
                                    onClick={handleProcessTranslations}
                                    disabled={isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0}
                                    className={`w-full ${isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0 ? 'opacity-50 border border-dashed text-muted-foreground' : ''}`}
                                    variant={isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0 ? "outline" : "default"}
                                  >
                                    {isProcessing && processingAction === 'process' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Queue for Translation
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {Object.values(selectedTypes).filter(Boolean).length === 0 ? 
                                  "Select at least one type to process" : 
                                  "Create translations for missing content"}
                              </TooltipContent>
                            </Tooltip>

                            {/* Retry Failed button */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex-1"> {/* Wrapper to capture hover events */}
                                  <Button 
                                    onClick={handleRetryTranslations}
                                    disabled={isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0 || (!hasFailedTranslations && !hasStaleTranslations)}
                                    className={`w-full ${isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0 || (!hasFailedTranslations && !hasStaleTranslations) ? 'opacity-50 border border-dashed text-muted-foreground' : ''}`}
                                    variant="outline"
                                  >
                                    {isProcessing && processingAction === 'retry' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Retry Failed
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                              {Object.values(selectedTypes).filter(Boolean).length === 0 ? 
                              "Select at least one type to retry" : 
                              !hasFailedTranslations && !hasStaleTranslations ? 
                                  "No failed or stale translations found for selected types" :
                                  hasStaleTranslations ? 
                                  "Retry failed and stuck pending translations" :
                                  "Retry existing failed translations only"}
                              </TooltipContent>
                            </Tooltip>

                            {/* Delete button */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex-1"> {/* Wrapper to capture hover events */}
                                  <Button 
                                    onClick={handleDeleteTranslations}
                                    disabled={isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0 || (!hasFailedTranslations && !hasStaleTranslations)}
                                    className={`w-full ${isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0 || (!hasFailedTranslations && !hasStaleTranslations) ? 'opacity-50 border border-dashed text-muted-foreground' : ''}`}
                                    variant={isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0 || (!hasFailedTranslations && !hasStaleTranslations) ? "outline" : "destructive"}
                                  >
                                    {isProcessing && processingAction === 'delete' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                              {Object.values(selectedTypes).filter(Boolean).length === 0 ? 
                              "Select at least one type to delete" : 
                              !hasFailedTranslations && !hasStaleTranslations ? 
                                  "No failed or stale translations found for selected types" :
                                  hasStaleTranslations ? 
                                  "Delete failed and stuck pending translations" :
                                  "Delete existing failed translations only"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </CardFooter>
                    </Card>
                  ) : (
                    // Show failed translations card if there are failed or stale translations 
                    hasFailedTranslations || hasStaleTranslations ? (
                      // Case: Failed translations exist, but no missing translations
                      <Card className="border-[var(--status-warning-border)]">
                        <CardHeader>
                          <CardTitle className="text-base">Failed Translations Found</CardTitle>
                          <CardDescription>
                            Some translations have failed and need attention
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-[color-mix(in_oklab,var(--status-warning-bg)_40%,transparent)] flex items-center justify-center">
                              <XCircle className="h-5 w-5 text-[var(--status-warning-border)]" />
                            </div>
                            <div>
                              <p className="text-[var(--status-warning-text)] font-medium">Failed translations require attention</p>
                              <p className="text-sm text-muted-foreground">
                                While there are no missing translations, some translations have failed.
                                {hasStaleTranslations && (
                                  <span className="block mt-1 text-amber-500 dark:text-amber-400">
                                    Some translations appear to be stuck in 'pending' state for over 1 minute.
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter className="border-t pt-4 flex flex-col items-start gap-4">
                          <div className="text-sm w-full">
                            <p>
                              Choose how to handle failed translations:
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3 w-full">
                            <TooltipProvider>
                              {/* Queue for Translation button - disabled when no missing translations */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex-1">
                                    <Button 
                                      onClick={handleProcessTranslations}
                                      disabled={true}
                                      className="w-full opacity-50 border border-dashed text-muted-foreground"
                                      variant="outline"
                                    >
                                      Queue for Translation
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  No missing translations to process
                                </TooltipContent>
                              </Tooltip>

                              {/* Retry Failed button */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex-1">
                                    <Button 
                                      onClick={handleRetryTranslations}
                                      disabled={isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0}
                                      className={`w-full ${isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0 ? 'opacity-50 border border-dashed text-muted-foreground' : ''}`}
                                      variant="outline"
                                    >
                                      {isProcessing && processingAction === 'retry' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                      <RefreshCw className="mr-2 h-4 w-4" />
                                      Retry Failed
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {Object.values(selectedTypes).filter(Boolean).length === 0 ? 
                                  "Select at least one type to retry" : 
                                  hasStaleTranslations ?
                                  "Retry failed and stuck pending translations" :
                                  "Retry existing failed translations"}
                                </TooltipContent>
                              </Tooltip>

                              {/* Delete button */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex-1">
                                    <Button 
                                      onClick={handleDeleteTranslations}
                                      disabled={isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0}
                                      className={`w-full ${isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0 ? 'opacity-50 border border-dashed text-muted-foreground' : ''}`}
                                      variant={isProcessing || Object.values(selectedTypes).filter(Boolean).length === 0 ? "outline" : "destructive"}
                                    >
                                      {isProcessing && processingAction === 'delete' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {Object.values(selectedTypes).filter(Boolean).length === 0 ? 
                                  "Select at least one type to delete" : 
                                  hasStaleTranslations ?
                                  "Delete failed and stuck pending translations" :
                                  "Delete existing failed translations"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </CardFooter>
                      </Card>
                    ) : (!hasMissingTranslations && !hasStaleTranslations ? (
                      // Case: No missing translations and no failed translations
                      <Card className="border-[var(--status-success-border)]">
                        <CardHeader>
                          <CardTitle className="text-base">No Missing Translations</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-[color-mix(in_oklab,var(--status-success-bg)_40%,transparent)] flex items-center justify-center">
                              <CheckCircle className="h-5 w-5 text-[var(--status-success-border)]" />
                            </div>
                            <div>
                              <p className="text-[var(--status-success-text)] font-medium">All content is fully translated</p>
                              <p className="text-sm text-muted-foreground">
                                No missing translations found for any enabled languages.
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : null)
                  )}

                  {result.details && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getTypeCounts().map((category) => (
                        <Card key={category.type} className={category.count > 0 ? "border-[var(--status-warning-border)]" : ""}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              {category.icon}
                              {category.displayName}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              {category.count}
                            </div>
                          </CardContent>
                          <CardFooter className="pt-0">
                            <div className="text-xs text-muted-foreground">
                              <p>
                                {category.count > 0
                                  ? `Missing translations for ${category.count} items`
                                  : "All items fully translated"
                                }
                              </p>
                              {category.count > 0 && category.type !== 'Generated' && category.type !== 'Generated (List)' ? (
                                <div className="mt-2 flex items-center gap-2">
                                  <Checkbox
                                    id={`select-${category.type}`}
                                    checked={selectedTypes[category.type] || false}
                                    onCheckedChange={(checked) => {
                                      setSelectedTypes(prev => ({
                                        ...prev,
                                        [category.type]: !!checked
                                      }));
                                    }}
                                  />
                                  <label
                                    htmlFor={`select-${category.type}`}
                                    className="text-xs cursor-pointer"
                                  >
                                    Select for processing
                                  </label>
                                </div>
                              ) : category.count > 0 && category.type === 'Generated' ? (
                                <div className="mt-2">
                                  <span className="text-xs">
                                    <span className="font-semibold">This is normal:</span> these translations are handled by the Document Translator.
                                  </span>
                                </div>
                              ) : category.count > 0 && category.type === 'Generated (List)' ? (
                                <div className="mt-2">
                                  <span className="text-xs">
                                    <span className="font-semibold">This is normal:</span> these translations are handled by the Shopping Lists Builder.
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="details" className="flex-1 min-h-0 overflow-hidden">
              <ScrollArea className="h-[calc(85vh-13rem)]">
                <div className="flex flex-col gap-4 p-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Content Details</CardTitle>
                      <CardDescription>
                        Breakdown of missing translations by content type
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      {result.details?.sampleItems && Object.entries(result.details.sampleItems).map(([type, items]) => {
                        if (!items || items.length === 0) return null;
                        
                        // Get proper display name for the type
                        const typeInfo = getTypeCounts().find(t => t.type === type);
                        const displayName = typeInfo?.displayName || type;
                        
                        return (
                          <div key={type} className="flex flex-col gap-2">
                            <h4 className="text-sm font-semibold flex items-center">
                              {typeInfo?.icon} 
                              <span className="ml-2">{displayName} ({items.length} examples)</span>
                            </h4>
                            {/* Native max-h grow-to-fit is intentional
                                (shadcn-exception, per AGENTS.md / ISSUES.md
                                #32): this nests inside the Details tab's
                                ScrollArea, so a second ScrollArea would trap
                                scroll; the sample lists are short/variable, so
                                grow-to-fit avoids an empty fixed-height box. */}
                            <div className="max-h-[30vh] sm:max-h-[150px] overflow-auto rounded-md border p-3">
                              {items.map((item, i) => (
                                <React.Fragment key={i}>
                                  <div className="text-sm text-muted-foreground">
                                    {item}
                                  </div>
                                  {i < items.length - 1 && <Separator className="my-2" />}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {(!result.details?.sampleItems || Object.keys(result.details.sampleItems).length === 0) && (
                        <div className="text-center text-muted-foreground py-4">
                          No details available to display
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="languages" className="flex-1 min-h-0 overflow-hidden">
              <ScrollArea className="h-[calc(85vh-13rem)]">
                <div className="flex flex-col gap-4 p-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Language Breakdown</CardTitle>
                      <CardDescription>
                        Missing translations by language
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {getLanguageCounts().map((lang) => (
                          <div key={lang.language} className="flex flex-col gap-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{lang.displayName}</span>
                              <span>{lang.count} missing</span>
                            </div>
                            <div className="h-2 w-full bg-secondary overflow-hidden rounded-full">
                              <div 
                                className="h-full bg-primary" 
                                style={{ 
                                  width: `${Math.min(100, (lang.count / (result.count || 1)) * 100)}%` 
                                }}
                              />
                            </div>
                          </div>
                        ))}

                        {getLanguageCounts().length === 0 && (
                          <div className="text-center text-muted-foreground py-4">
                            No language breakdown available
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>
            </TabsContents>
          </Tabs>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-2 pt-2">
          {!result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSearching}>
                Cancel
              </Button>
              <Button onClick={handleFindMissing} disabled={isSearching || isLoading}>
                {isSearching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSearching ? 'Scanning...' : 'Find Missing Translations'}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)} disabled={isProcessing}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
