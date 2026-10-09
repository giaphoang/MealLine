// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useEffect, useState } from 'react';
import { FileOutput, Download, Languages, FileIcon, AlertTriangle, FileSearch, TriangleAlert, CircleHelp } from "@/components/ui/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Card, CardContent } from '../../ui/card';
import { Checkbox } from '../../ui/checkbox';
import { Switch } from '../../ui/switch';
import { Label } from '../../ui/label';
import { Button } from '../../ui/button';
import { ButtonIconX } from '@/components/ui/button-icon-x';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Translation, TranslationProgress, DocumentService } from '@/services/document-translator';
import { truncateMiddle } from '@/lib/utils';
import { useMessage } from '@/hooks/message/useMessage';

interface AdvancedSegment {
  id: string;
  text: string;
  paragraphIndex: number;
  positions: any[];
  isFiltered: boolean;
  isSkipped: boolean;
  hasSkipTranslation: boolean;
  instanceCount: number;
  cacheStatus: {
    hasCachedTranslation: boolean;
  };
}

interface Language {
  name: string;
  isEnabled: boolean;
}

interface TranslateDialogProps {
  documentId: number;
  documentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Controlled state props
  selectedLanguages: string[];
  onSelectedLanguagesChange: (languages: string[]) => void;
  step: 'languages' | 'conflict' | 'formatting' | 'download';
  onStepChange: (step: 'languages' | 'conflict' | 'formatting' | 'download') => void;
  isTranslating: boolean;
  translationCompleted: boolean;
  currentTranslations: Translation[];
  includeOriginalText: boolean;
  onIncludeOriginalTextChange: (include: boolean) => void;
  availableLanguages: Language[];
  isLoadingLanguages: boolean;
  translationProgress: Map<string, TranslationProgress>;
  // Action handlers
  onTranslate: (languages: string[], options: { includeOriginalText: boolean; segmentOptions?: { skipSegments: string[]; includeEnglishSegments: string[]; bypassCache?: string[] }; overwrite?: boolean }) => Promise<void>;
  onDownloadDocument: (id: number) => void;
  onDownloadTranslation: (id: number, language: string) => void;
  onDownloadAll: (documentId: number) => void;
  onCancel: () => void;
  onDone: () => void;
}

export function TranslateDialog({ 
  documentId, 
  documentName, 
  open, 
  onOpenChange,
  selectedLanguages,
  onSelectedLanguagesChange,
  step,
  onStepChange,
  isTranslating,
  translationCompleted,
  currentTranslations,
  includeOriginalText,
  onIncludeOriginalTextChange,
  availableLanguages,
  isLoadingLanguages,
  translationProgress,
  onTranslate,
  onDownloadDocument,
  onDownloadTranslation,
  onDownloadAll,
  onCancel,
  onDone
}: TranslateDialogProps) {
  const { showMessage } = useMessage();
  const [activeTab, setActiveTab] = useState('basic');
  
  // Conflict resolution state
  const [conflictingLanguages, setConflictingLanguages] = useState<string[]>([]);
  const [conflictAction, setConflictAction] = useState<'overwrite' | 'keep' | null>(null);
  const [helpTooltipOpen, setHelpTooltipOpen] = useState(false);
  
  // Advanced mode state
  const [advancedSegments, setAdvancedSegments] = useState<AdvancedSegment[]>([]);
  const [segmentSkipMap, setSegmentSkipMap] = useState<Map<string, boolean>>(new Map());
  const [segmentIncludeMap, setSegmentIncludeMap] = useState<Map<string, boolean>>(new Map());
  const [segmentCacheMap, setSegmentCacheMap] = useState<Map<string, boolean>>(new Map());
  const [segmentInstances, setSegmentInstances] = useState<Record<string, any[]>>({});
  const [isExtractingSegments, setIsExtractingSegments] = useState(false);
  const [segmentExtractionCompleted, setSegmentExtractionCompleted] = useState(false);
  const [isAutoFormatting, setIsAutoFormatting] = useState(false);
  
  // Step 1 optimizations: Session caching and deduplication
  const [extractionSessionId, setExtractionSessionId] = useState<string>('');
  const [segmentDeduplicationMap, setSegmentDeduplicationMap] = useState<Record<string, string[]>>({});
  
  // Manual formatting cache state
  const [saveFormattingChoices, setSaveFormattingChoices] = useState(true);

  // Toggle language selection
  const toggleLanguage = (language: string) => {
    const newSelection = selectedLanguages.includes(language)
      ? selectedLanguages.filter(lang => lang !== language)
      : [...selectedLanguages, language];
    onSelectedLanguagesChange(newSelection);
  };

  // Handle select all languages
  const selectAllLanguages = () => {
    onSelectedLanguagesChange(availableLanguages.map(lang => lang.name));
  };

  // Handle clear selection
  const clearSelection = () => {
    onSelectedLanguagesChange([]);
  };

  // Check for existing translations and set conflict state
  const checkForConflicts = () => {
    const conflicting = selectedLanguages.filter(lang => 
      currentTranslations.some(t => t.language === lang)
    );
    setConflictingLanguages(conflicting);
    return conflicting;
  };

  // Check if all selected languages are in conflict
  const allLanguagesInConflict = conflictingLanguages.length > 0 && conflictingLanguages.length === selectedLanguages.length;

  // Handle conflict resolution
  const handleConflictAction = (action: 'overwrite' | 'keep') => {
    setConflictAction(action);
    if (action === 'keep') {
      // Remove conflicting languages from selection
      const nonConflictingLanguages = selectedLanguages.filter(lang => 
        !conflictingLanguages.includes(lang)
      );
      onSelectedLanguagesChange(nonConflictingLanguages);
    }
    proceedAfterConflictResolution();
  };

  // Proceed to next step after conflict resolution
  const proceedAfterConflictResolution = async () => {
    if (activeTab === 'advanced') {
      // Extract segments for advanced mode
      setIsExtractingSegments(true);
      setSegmentExtractionCompleted(false);
      
      try {
        const result = await DocumentService.extractSegments(documentId, selectedLanguages);
        
        const displaySegments = result.segments.filter(segment => 
          segment.isFiltered || segment.hasSkipTranslation
        );
        
        setAdvancedSegments(displaySegments);
        setSegmentInstances(result.segmentInstances || {});
        
        // Step 1 optimization: Generate session ID and cache data
        const sessionId = generateSessionId();
        setExtractionSessionId(sessionId);
        cacheSegmentData(sessionId, displaySegments);
        
        // Step 1 optimization: Create deduplication map
        const dedupMap = createDeduplicationMap(displaySegments);
        setSegmentDeduplicationMap(dedupMap);
        
        const newSkipMap = new Map<string, boolean>();
        const newIncludeMap = new Map<string, boolean>();
        const newCacheMap = new Map<string, boolean>();
        
        displaySegments.forEach(segment => {
          newSkipMap.set(segment.id, segment.hasSkipTranslation);
          newIncludeMap.set(segment.id, false);
          newCacheMap.set(segment.id, segment.cacheStatus.hasCachedTranslation);
        });
        
        setSegmentSkipMap(newSkipMap);
        setSegmentIncludeMap(newIncludeMap);
        setSegmentCacheMap(newCacheMap);
        setSegmentExtractionCompleted(true);
        onStepChange('formatting');
      } catch (error) {
        console.error('Error extracting segments:', error);
      } finally {
        setIsExtractingSegments(false);
      }
    } else {
      // Basic mode - proceed directly to translation
      onStepChange('download');
      if (selectedLanguages.length > 0) {
        await onTranslate(selectedLanguages, { 
          includeOriginalText,
          overwrite: conflictAction === 'overwrite'
        });
      }
    }
  };

  // Handle segment extraction for Advanced mode
  const handleAdvancedNext = async () => {
    if (activeTab === 'basic') {
      return handleTranslate();
    }
    
    // Check for conflicts first
    const conflicts = checkForConflicts();
    if (conflicts.length > 0) {
      onStepChange('conflict');
      return;
    }
    
    // Advanced mode - extract segments first
    setIsExtractingSegments(true);
    setSegmentExtractionCompleted(false);
    
    try {
      const result = await DocumentService.extractSegments(documentId, selectedLanguages);
      
      // Filter out segments that should be excluded (whitespace-only, etc)
      const displaySegments = result.segments.filter(segment => 
        segment.isFiltered || segment.hasSkipTranslation
      );
      
      setAdvancedSegments(displaySegments);
      setSegmentInstances(result.segmentInstances || {});
      
      // Step 1 optimization: Generate session ID and cache data
      const sessionId = generateSessionId();
      setExtractionSessionId(sessionId);
      cacheSegmentData(sessionId, displaySegments);
      
      // Step 1 optimization: Create deduplication map
      const dedupMap = createDeduplicationMap(displaySegments);
      setSegmentDeduplicationMap(dedupMap);
      
      // Initialize segment maps using segment ID as key
      const newSkipMap = new Map<string, boolean>();
      const newIncludeMap = new Map<string, boolean>();
      const newCacheMap = new Map<string, boolean>();
      
      displaySegments.forEach(segment => {
      newSkipMap.set(segment.id, segment.hasSkipTranslation);
      newIncludeMap.set(segment.id, false);
      newCacheMap.set(segment.id, segment.cacheStatus.hasCachedTranslation);
      });
      
      setSegmentSkipMap(newSkipMap);
      setSegmentIncludeMap(newIncludeMap);
      setSegmentCacheMap(newCacheMap);
      setSegmentExtractionCompleted(true);
      onStepChange('formatting');
    } catch (error) {
      console.error('Error extracting segments:', error);
    } finally {
      setIsExtractingSegments(false);
    }
  };

  // Handle skip checkbox toggle
  const toggleSegmentSkip = (segmentId: string) => {
    const newSkipMap = new Map(segmentSkipMap);
    const newIncludeMap = new Map(segmentIncludeMap);
    const isChecked = !newSkipMap.get(segmentId);
    
    newSkipMap.set(segmentId, isChecked);
    if (isChecked) {
      newIncludeMap.set(segmentId, false);
    }
    
    setSegmentSkipMap(newSkipMap);
    setSegmentIncludeMap(newIncludeMap);
  };

  // Handle include English checkbox toggle
  const toggleSegmentInclude = (segmentId: string) => {
    const newIncludeMap = new Map(segmentIncludeMap);
    const newSkipMap = new Map(segmentSkipMap);
    const isChecked = !newIncludeMap.get(segmentId);
    
    newIncludeMap.set(segmentId, isChecked);
    if (isChecked) {
      newSkipMap.set(segmentId, false);
    }
    
    setSegmentIncludeMap(newIncludeMap);
    setSegmentSkipMap(newSkipMap);
  };

  // Handle select all skip
  const selectAllSkip = () => {
    const newSkipMap = new Map(segmentSkipMap);
    const newIncludeMap = new Map(segmentIncludeMap);
    const allSelected = userReadableSegments.every(segment => newSkipMap.get(segment.id));
    const shouldCheck = !allSelected;
    
    userReadableSegments.forEach(segment => {
      newSkipMap.set(segment.id, shouldCheck);
      if (shouldCheck) {
        newIncludeMap.set(segment.id, false);
      }
    });
    
    setSegmentSkipMap(newSkipMap);
    setSegmentIncludeMap(newIncludeMap);
  };

  // Handle select all include
  const selectAllInclude = () => {
    const newIncludeMap = new Map(segmentIncludeMap);
    const newSkipMap = new Map(segmentSkipMap);
    const allSelected = userReadableSegments.every(segment => newIncludeMap.get(segment.id));
    const shouldCheck = !allSelected;
    
    userReadableSegments.forEach(segment => {
      newIncludeMap.set(segment.id, shouldCheck);
      if (shouldCheck) {
        newSkipMap.set(segment.id, false);
      }
    });
    
    setSegmentIncludeMap(newIncludeMap);
    setSegmentSkipMap(newSkipMap);
  };

  // Handle cache checkbox toggle
  const toggleSegmentCache = (segmentId: string) => {
    const newCacheMap = new Map(segmentCacheMap);
    const isChecked = !newCacheMap.get(segmentId);
    newCacheMap.set(segmentId, isChecked);
    setSegmentCacheMap(newCacheMap);
  };

  // Handle select all cache
  const selectAllCache = () => {
    const newCacheMap = new Map(segmentCacheMap);
    const enabledCacheSegments = userReadableSegments.filter(segment => segment.cacheStatus.hasCachedTranslation);
    const allSelected = enabledCacheSegments.every(segment => newCacheMap.get(segment.id));
    const shouldCheck = !allSelected;
    
    enabledCacheSegments.forEach(segment => {
      newCacheMap.set(segment.id, shouldCheck);
    });
    
    setSegmentCacheMap(newCacheMap);
  };

  // Enhanced function to clean technical markings and optimize for classification
  const cleanTechnicalMarkings = (text: string): string => {
    return text
      .replace(/<!STYLE_BOUNDARY!>/g, '')
      .replace(/<STYLE_BOUND[^>]*>/g, '')
      .replace(/#____#/g, '')
      .replace(/<!([^>]*)>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '') // Remove HTML comments
      .replace(/<[^>]*>/g, '') // Remove any remaining HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/^\s+|\s+$/g, '') // Trim edges
      .trim();
  };

  // Step 1 optimization: Generate unique session ID for caching
  const generateSessionId = (): string => {
    return `session_${documentId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Step 1 optimization: Cache segment data in session storage
  const cacheSegmentData = (sessionId: string, segments: AdvancedSegment[]) => {
    try {
      const cacheData = {
        sessionId,
        documentId,
        timestamp: Date.now(),
        segments: segments.map(seg => ({
          id: seg.id,
          originalText: seg.text,
          cleanedText: cleanTechnicalMarkings(seg.text),
          paragraphIndex: seg.paragraphIndex,
          positions: seg.positions,
          isFiltered: seg.isFiltered,
          isSkipped: seg.isSkipped,
          hasSkipTranslation: seg.hasSkipTranslation,
          instanceCount: seg.instanceCount,
          cacheStatus: seg.cacheStatus
        }))
      };
      sessionStorage.setItem(`segment_cache_${sessionId}`, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to cache segment data:', error);
    }
  };

  // Step 1 optimization: Create deduplication map for optimized API calls
  const createDeduplicationMap = (segments: AdvancedSegment[]): Record<string, string[]> => {
    const dedupMap: Record<string, string[]> = {};
    
    segments.forEach(segment => {
      const cleanedText = cleanTechnicalMarkings(segment.text);
      if (!dedupMap[cleanedText]) {
        dedupMap[cleanedText] = [];
      }
      dedupMap[cleanedText].push(segment.id);
    });
    
    return dedupMap;
  };

  // Use all segments for display (no filtering)
  const userReadableSegments = advancedSegments;
  
  // Step 1 optimization: Get unique texts count for performance metrics
  const getUniqueTextsCount = (): number => {
    return Object.keys(segmentDeduplicationMap).length;
  };

  // Handle auto-format button click using backend decisions
  const handleAutoFormat = async () => {
    if (!segmentExtractionCompleted || userReadableSegments.length === 0) {
      return;
    }

    setIsAutoFormatting(true);
    
    try {
      // Step 1 optimization: Prepare optimized payload with deduplication
      const uniqueTextsCount = getUniqueTextsCount();
      const totalSegmentsCount = userReadableSegments.length;
      
      console.log(`Auto-Format optimization: ${totalSegmentsCount} segments → ${uniqueTextsCount} unique texts (${Math.round((1 - uniqueTextsCount/totalSegmentsCount) * 100)}% deduplication)`);
      
      // Call optimized classification API with deduplicated segment map and session ID
      const response = await DocumentService.classifySegmentsOptimized(
        documentId, 
        segmentDeduplicationMap, 
        extractionSessionId
      );
      
      // Initialize state maps for updates
      const newSkipMap = new Map(segmentSkipMap);
      const newIncludeMap = new Map(segmentIncludeMap);
      
      let appliedCount = 0;
      
      // Step 1 optimization: Apply backend decisions to ALL segments using object format
      Object.entries(response.decisions).forEach(([segmentId, action]) => {
        switch (action) {
          case 'skip':
            newSkipMap.set(segmentId, true);
            newIncludeMap.set(segmentId, false);
            appliedCount++;
            break;
            
          case 'include':
            newSkipMap.set(segmentId, false);
            newIncludeMap.set(segmentId, true);
            appliedCount++;
            break;
            
          case 'normal':
            newSkipMap.set(segmentId, false);
            newIncludeMap.set(segmentId, false);
            appliedCount++;
            break;
        }
      });
      
      // Update UI with all decisions at once
      React.startTransition(() => {
        setSegmentSkipMap(newSkipMap);
        setSegmentIncludeMap(newIncludeMap);
      });
      
      // Show success message with configuration info and cache stats
      if (response.appliedConfig) {
        let message = `Auto-Format applied using "${response.appliedConfig}" configuration`;
        if (response.cacheStats) {
          const { cachedSegments, newClassifications, cacheHitRate } = response.cacheStats;
          message += ` (${cachedSegments} cached, ${newClassifications} new, ${cacheHitRate}% cache hit rate)`;
        }
        showMessage(message, 'success');
      } else {
        showMessage('Auto-Format completed successfully', 'success');
      }
      
    } catch (error) {
      console.error('Error in auto-format:', error);
      
      // Handle specific configuration missing error
      if (error instanceof Error && error.message.includes('Auto-Format requires configuration')) {
        showMessage(error.message, 'error');
      } else {
        showMessage('Auto-Format failed. Please check your AI Configuration and try again.', 'error');
      }
    } finally {
      setIsAutoFormatting(false);
    }
  };



  // Handle advanced translate
  const handleAdvancedTranslate = async () => {
    try {
      // Collect manual choices if save toggle is enabled
      if (saveFormattingChoices && userReadableSegments.length > 0) {
        const manualChoices = userReadableSegments.map(segment => {
          const skipSelected = segmentSkipMap.get(segment.id);
          const includeSelected = segmentIncludeMap.get(segment.id);
          
          let action: 'skip' | 'include' | 'normal';
          if (skipSelected) action = 'skip';
          else if (includeSelected) action = 'include';
          else action = 'normal';
          
          return {
            originalText: cleanTechnicalMarkings(segment.text),
            classificationAction: action
          };
        });
        
        try {
          // Save manual choices before starting translation
          await DocumentService.saveManualFormattingChoices(
            documentId,
            manualChoices
          );
          
          showMessage(
            `Formatting choices saved: ${manualChoices.length} manual decisions stored for future use`,
            'success'
          );
        } catch (error) {
          console.error('Error saving manual choices:', error);
          showMessage('Failed to save formatting choices', 'error');
        }
      }
      
      onStepChange('download');
      if (selectedLanguages.length > 0) {
        const skipSegments: string[] = [];
        const includeEnglishSegments: string[] = [];
        const bypassCache: string[] = [];
        
        userReadableSegments.forEach(segment => {
          if (segmentSkipMap.get(segment.id)) {
            skipSegments.push(segment.text);
          }
          if (segmentIncludeMap.get(segment.id)) {
            includeEnglishSegments.push(segment.text);
          }
          if (!segmentCacheMap.get(segment.id)) {
            bypassCache.push(segment.text);
          }
        });
        
        // Call onTranslate with advanced options
        await onTranslate(selectedLanguages, {
          includeOriginalText: false,
          segmentOptions: {
            skipSegments,
            includeEnglishSegments,
            bypassCache
          },
          overwrite: conflictAction === 'overwrite'
        });
      }
    } catch (error) {
      console.error('Error in handleAdvancedTranslate:', error);
    }
  };

  // Proceed to download step and start translation
  const handleTranslate = async () => {
    try {
      // Check for conflicts first
      const conflicts = checkForConflicts();
      if (conflicts.length > 0) {
        onStepChange('conflict');
        return;
      }
      
      onStepChange('download');
      if (selectedLanguages.length > 0) {
        await onTranslate(selectedLanguages, { 
          includeOriginalText,
          overwrite: conflictAction === 'overwrite'
        });
      }
    } catch (error) {
      console.error('Error in handleTranslate:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Translate Document</DialogTitle>
        </DialogHeader>
        
        {/* Language Selection Step */}
        {step === 'languages' && (
          <div className="space-y-4">
            <div className="text-center">
              <Languages className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="mt-2 text-lg font-medium">Select Languages</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Select languages to translate "{documentName}" into
              </p>
            </div>

            <Alert variant="warning" className="mt-3 mb-2 border-0">
              <AlertTriangle className="h-6 w-6" />
              <AlertTitle className="text-sm font-medium">
                AI translations may contain errors. Always review before use.
              </AlertTitle>
            </Alert>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="min-h-[280px]">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="basic">Basic</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                </TabsList>

              <TabsContents>
              <TabsContent value="basic" className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 my-4">
                  {selectedLanguages.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {selectedLanguages.length} selected
                      </span>
                      <ButtonIconX
                        onClick={clearSelection}
                        className="h-7"
                        disabled={isLoadingLanguages || selectedLanguages.length === 0}
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={selectAllLanguages}
                    className="h-7"
                    disabled={isLoadingLanguages}
                  >
                    Select All
                  </Button>
                </div>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center space-x-2 mb-4 p-1 border-b pb-3">
                      <Checkbox 
                        id="include-original-text" 
                        checked={includeOriginalText}
                        onCheckedChange={(checked) => onIncludeOriginalTextChange(!!checked)}
                      />
                      <label
                        htmlFor="include-original-text"
                        className="text-sm font-medium leading-none cursor-pointer"
                      >
                        Include original English in parentheses (e.g. "Яйца (Eggs)")
                      </label>
                    </div>
                    
                    {isLoadingLanguages ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">Loading available languages...</p>
                      </div>
                    ) : availableLanguages.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">No languages available for translation. Please enable additional languages in Language Management.</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[12vh]">
                        <div className="grid grid-cols-2 gap-4 pr-4">
                            {availableLanguages.map((language) => (
                              <div key={language.name} className="flex items-center space-x-2">
                                <Checkbox 
                                  id={`language-${language.name}`} 
                                  checked={selectedLanguages.includes(language.name)}
                                  onCheckedChange={() => toggleLanguage(language.name)}
                                />
                                <label
                                  htmlFor={`language-${language.name}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                  {language.name}
                                </label>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="advanced" className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 my-4">
                  {selectedLanguages.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {selectedLanguages.length} selected
                      </span>
                      <ButtonIconX
                        onClick={clearSelection}
                        className="h-7"
                        disabled={isLoadingLanguages || selectedLanguages.length === 0}
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={selectAllLanguages}
                    className="h-7"
                    disabled={isLoadingLanguages}
                  >
                    Select All
                  </Button>
                </div>

                <Card>
                  <CardContent className="pt-6">
                    {isLoadingLanguages ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">Loading available languages...</p>
                      </div>
                    ) : availableLanguages.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">No languages available for translation. Please enable additional languages in Language Management.</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[17vh]">
                        <div className="grid grid-cols-2 gap-4 pr-4">
                            {availableLanguages.map((language) => (
                              <div key={language.name} className="flex items-center space-x-2">
                                <Checkbox 
                                  id={`language-advanced-${language.name}`} 
                                  checked={selectedLanguages.includes(language.name)}
                                  onCheckedChange={() => toggleLanguage(language.name)}
                                />
                                <label
                                  htmlFor={`language-advanced-${language.name}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                  {language.name}
                                </label>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              </TabsContents>
              </div>
            </Tabs>
            
            <div className="flex justify-between pt-2">
              <Button
                variant="outline"
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAdvancedNext}
                disabled={selectedLanguages.length === 0}
              >
                {activeTab === 'basic' ? 'Translate' : 'Next'}
              </Button>
            </div>
          </div>
        )}
        
        {/* Translation Conflict Step */}
        {step === 'conflict' && (
          <div className="space-y-4">
            <div className="text-center">
              <TriangleAlert className="h-12 w-12 mx-auto text-amber-500" />
              <h3 className="mt-2 text-lg font-medium text-amber-600">Translation Conflict Detected</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Translations already exist for this document in {conflictingLanguages.join(', ')}
              </p>
            </div>

            <div className="text-sm text-muted-foreground text-center flex items-center justify-center gap-1">
              Choose how to handle existing translations.
              <Tooltip open={helpTooltipOpen} onOpenChange={setHelpTooltipOpen}>
                <TooltipTrigger asChild>
                  <CircleHelp 
                    className="h-4 w-4 cursor-pointer" 
                    onClick={() => setHelpTooltipOpen(!helpTooltipOpen)}
                  />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <div className="space-y-2">
                    <div>
                      <strong>Overwrite:</strong> Delete existing translated documents and create new translations (cached translations preserved)
                    </div>
                    <div>
                      <strong>Keep:</strong> Preserve existing translations and translate only non-conflicting languages
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => onStepChange('languages')}
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleConflictAction('overwrite')}
                  variant="outline"
                  className="text-destructive border-destructive hover:bg-destructive/10"
                >
                  Overwrite Documents
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button
                        onClick={() => handleConflictAction('keep')}
                        variant="default"
                        disabled={allLanguagesInConflict}
                      >
                        Keep Documents
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {allLanguagesInConflict && (
                    <TooltipContent className="max-w-sm">
                      <p>Translations already exist for all selected languages. Go back and choose additional languages or choose "Overwrite" to create new translations.</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>
            </div>
          </div>
        )}
        
        {/* Select Formatting Step */}
        {step === 'formatting' && (
          <div className="space-y-4">
            <div className="text-center">
              <FileSearch className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="mt-2 text-lg font-medium">Select Advanced Translation Options</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Select options for text segments contained in "{documentName}"
              </p>
            </div>

            <Alert variant="warning" className="mt-3 mb-2 border-0">
              <AlertTriangle className="h-6 w-6" />
              <AlertTitle className="text-sm font-medium">
                AI translations may contain errors. Always review before use.
              </AlertTitle>
            </Alert>

            {isExtractingSegments ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="py-8 flex flex-col items-center justify-center">
                    <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4 text-sm text-muted-foreground">
                      Extracting document segments. This may take a moment.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : segmentExtractionCompleted ? (
              <div className="border rounded-md overflow-hidden">
                <Table className="table-fixed">
                  <colgroup>
                    <col style={{width: '48%'}} />
                    <col style={{width: '60px'}} />
                    <col style={{width: '60px'}} />
                    <col style={{width: '60px'}} />
                  </colgroup>
                  
                  {/* Text Labels Row */}
                  <TableHeader className="[&_tr]:border-b-0">
                    <TableRow>
                      <TableHead className="w-[48%] text-center py-2 translation-options-column">
                        <span className="translation-options-header">Advanced Options</span>
                      </TableHead>
                      <TableHead className="w-[60px] text-center py-2 translation-action-column">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="translation-action-header cursor-help">Don't<br />Translate</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <p>Skip translation for selected text segments. These segments will remain in their original language in the translated document.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="w-[60px] text-center py-2 translation-action-column">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="translation-action-header cursor-help">Include<br />English</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <p>Add the original English text in parentheses after the translated text for selected segments (e.g., "Яйца (Eggs)").</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="w-[60px] text-center py-2 translation-action-column">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="translation-action-header cursor-help">Use<br />Cache</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <p>Use existing cached translations for selected segments. Unchecking forces fresh translation from the AI service, which may incur additional costs.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  
                  {/* Checkbox Header */}
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[48%] text-center py-2 translation-options-column">
                        <span>Set Options For All Segments:</span>
                      </TableHead>
                      <TableHead className="w-[60px] text-center py-2 translation-action-column">
                        <Checkbox
                          checked={userReadableSegments.length > 0 && userReadableSegments.every(segment => segmentSkipMap.get(segment.id))}
                          onCheckedChange={selectAllSkip}
                        />
                      </TableHead>
                      <TableHead className="w-[60px] text-center py-2 translation-action-column">
                        <Checkbox
                          checked={userReadableSegments.length > 0 && userReadableSegments.every(segment => segmentIncludeMap.get(segment.id))}
                          onCheckedChange={selectAllInclude}
                        />
                      </TableHead>
                      <TableHead className="w-[60px] text-center py-2 translation-action-column">
                        <Checkbox
                          checked={userReadableSegments.filter(segment => segment.cacheStatus.hasCachedTranslation).length > 0 && userReadableSegments.filter(segment => segment.cacheStatus.hasCachedTranslation).every(segment => segmentCacheMap.get(segment.id))}
                          onCheckedChange={selectAllCache}
                          disabled={userReadableSegments.filter(segment => segment.cacheStatus.hasCachedTranslation).length === 0}
                        />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                </Table>
                  
                {/* Scrollable Body */}
                <ScrollArea className="h-[21vh]">
                  <Table className="table-fixed">
                    <colgroup>
                      <col style={{width: '48%'}} />
                      <col style={{width: '60px'}} />
                      <col style={{width: '60px'}} />
                      <col style={{width: '60px'}} />
                    </colgroup>
                    <TableBody>
                      {userReadableSegments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                            No user-readable segments found for formatting.
                          </TableCell>
                        </TableRow>
                      ) : (
                        userReadableSegments.map((segment) => (
                          <TableRow key={segment.text}>
                            <TableCell className="font-medium translation-data-cell">
                              <div className="flex items-center justify-between">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help">
                                      {truncateMiddle(cleanTechnicalMarkings(segment.text), 50)}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-md">
                                    <p>{cleanTechnicalMarkings(segment.text)}</p>
                                  </TooltipContent>
                                </Tooltip>
                                {segment.instanceCount > 1 && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    ({segment.instanceCount}x)
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center translation-data-cell-action">
                              <Checkbox
                                checked={segmentSkipMap.get(segment.id) || false}
                                onCheckedChange={() => toggleSegmentSkip(segment.id)}
                              />
                            </TableCell>
                            <TableCell className="text-center translation-data-cell-action">
                              <Checkbox
                                checked={segmentIncludeMap.get(segment.id) || false}
                                onCheckedChange={() => toggleSegmentInclude(segment.id)}
                              />
                            </TableCell>
                            <TableCell className="text-center translation-data-cell-action">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className={!segment.cacheStatus.hasCachedTranslation ? 'opacity-50' : ''}>
                                    <Checkbox
                                      checked={segmentCacheMap.get(segment.id) || false}
                                      onCheckedChange={() => toggleSegmentCache(segment.id)}
                                      disabled={!segment.cacheStatus.hasCachedTranslation}
                                    />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-sm">
                                  <p>
                                    {segment.cacheStatus.hasCachedTranslation
                                      ? "Use existing cached translations for this segment. Unchecking forces fresh translation from the AI service."
                                      : "No cached translation available for this segment. Will use fresh translation from the AI service."}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            ) : null}
            
            {/* Save Formatting Choices Toggle */}
            {segmentExtractionCompleted && userReadableSegments.length > 0 && (
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                <div className="space-y-0.5">
                  <Label htmlFor="save-formatting-choices">Save Formatting Choices</Label>
                  <p className="text-sm text-muted-foreground">
                    Auto-Format remembers your choices for future documents
                  </p>
                </div>
                <Switch
                  id="save-formatting-choices"
                  checked={saveFormattingChoices}
                  onCheckedChange={setSaveFormattingChoices}
                />
              </div>
            )}
            
            <div className="flex justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => onStepChange('languages')}
              >
                Back
              </Button>
              <Button
                variant="outline"
                onClick={handleAutoFormat}
                disabled={!segmentExtractionCompleted || userReadableSegments.length === 0 || isAutoFormatting}
              >
                {isAutoFormatting ? 'Auto-Formatting...' : 'Auto-Format'}
              </Button>
              <Button
                onClick={handleAdvancedTranslate}
                disabled={!segmentExtractionCompleted || selectedLanguages.length === 0}
              >
                Translate Advanced
              </Button>
            </div>
          </div>
        )}
        
        {/* Download/Translation Progress Step */}
        {step === 'download' && (
          <div className="space-y-4">
            <div className="text-center">
              <Download className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="mt-2 text-lg font-medium">Download Translations</h3>
              {isTranslating ? (
                <p className="text-sm text-muted-foreground">
                  Your documents are being translated. This may take a few minutes.
                </p>
              ) : selectedLanguages.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {translationCompleted 
                    ? "Your translations are ready to download" 
                    : "Preparing translations..."}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No languages were selected for translation.
                </p>
              )}
            </div>

            <Alert variant="warning" className="mt-3 mb-2 border-0">
              <AlertTriangle className="h-6 w-6" />
              <AlertTitle className="text-sm font-medium">
                AI translations may contain errors. Always review before use.
              </AlertTitle>
            </Alert>

            <Card>
              <CardContent className="pt-6">
                {isTranslating ? (
                  <ScrollArea className="h-[40vh]">
                    <div className="py-8 flex flex-col items-center justify-center">
                      <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <p className="mt-4 text-sm text-muted-foreground">
                        Translating your document. This may take a few minutes depending on the size.
                      </p>
                        {/* Show a message if there are many languages */}
                        {selectedLanguages.length > 5 && (
                          <div className="text-xs text-muted-foreground/70 text-center">
                            Scroll to view all {selectedLanguages.length} languages
                          </div>
                        )}                      
                      <div className="mt-4 space-y-4 w-full pr-4">
                        {/* Display cache stats if available */}
                        {selectedLanguages.map((lang) => {
                          const progress = translationProgress.get(`${documentId}-${lang}`);
                          if (progress?.stats) {
                            const hasFailures = progress.stats.failed && progress.stats.failed > 0;
                            const isCompleteFailure = progress.status === 'failed';
                            return (
                              <div key={lang} className={`p-3 rounded-md w-full ${
                                isCompleteFailure ? 'bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)]' :
                                hasFailures ? 'bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)]' :
                                'bg-muted'
                              }`}>
                                <h4 className="text-sm font-medium mb-1">
                                  {lang} Translation
                                  {isCompleteFailure && <span className="text-[var(--status-danger-text)] ml-2">✗ Failed</span>}
                                  {hasFailures && !isCompleteFailure && <span className="text-[var(--status-warning-text)] ml-2">⚠ Partial</span>}
                                </h4>
                                <div className="text-xs space-y-1">
                                  <div className="flex justify-between">
                                    <span>Processing:</span>
                                    <span>{Math.floor(progress.progress)}%</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Total segments:</span>
                                    <span>{progress.stats.total}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>From cache:</span>
                                    <span className="text-primary">{progress.stats.cached} ({Math.round(progress.stats.cached / (progress.stats.total || 1) * 100)}%)</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>New translations:</span>
                                    <span>{progress.stats.newTranslations}</span>
                                  </div>
                                  {hasFailures && (
                                    <div className="flex justify-between text-[var(--status-warning-text)]">
                                      <span>Failed segments:</span>
                                      <span>{progress.stats.failed}</span>
                                    </div>
                                  )}
                                  {progress.message && progress.message !== 'Translation completed' && (
                                    <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                                      {progress.message}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  </ScrollArea>
                ) : (
                  <ScrollArea className="h-[40vh]">
                    <div className="space-y-4 pr-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center min-w-0 flex-1 mr-2">
                          <FileIcon className="w-6 h-6 mr-2 shrink-0" />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">{truncateMiddle(documentName)}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{documentName}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => onDownloadDocument(documentId)}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Original
                        </Button>
                      </div>
                      
                      {!translationCompleted ? (
                        // Show languages being translated
                        selectedLanguages.map((lang) => {
                          const progress = translationProgress.get(`${documentId}-${lang}`);
                          
                          return (
                            <div key={lang} className="flex items-center justify-between">
                              <div className="flex items-center min-w-0 flex-1 mr-2">
                                <FileIcon className="w-6 h-6 mr-2 shrink-0" />
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help">{truncateMiddle(`${documentName.split('.')[0]}_${lang}.docx`)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{`${documentName.split('.')[0]}_${lang}.docx`}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <div className="flex items-center">
                                {progress?.status === 'completed' ? (
                                  <>
                                    {progress.stats?.failed && progress.stats.failed > 0 ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button 
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => onDownloadTranslation(documentId, lang)}
                                            className="border-[var(--status-warning-border)]"
                                          >
                                            <span className="text-[var(--status-warning-text)] mr-2">⚠</span>
                                            <Download className="w-4 h-4 mr-2" />
                                            {lang}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Translation completed with {progress.stats.failed} segments using fallback text</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => onDownloadTranslation(documentId, lang)}
                                      >
                                        <Download className="w-4 h-4 mr-2" />
                                        {lang}
                                      </Button>
                                    )}
                                  </>
                                ) : progress?.status === 'failed' ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" size="sm" disabled className="border-[var(--status-danger-border)]">
                                        <span className="text-[var(--status-danger-text)] mr-2">✗</span>
                                        Failed
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{progress?.message || 'Translation failed'}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Button variant="outline" size="sm" disabled>
                                    <span className="animate-pulse mr-2">⟳</span>
                                    {progress?.progress}%
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        // Show actual translations available for download
                        currentTranslations.map((translation) => (
                          <div key={translation.id} className="flex items-center justify-between">
                            <div className="flex items-center min-w-0 flex-1 mr-2">
                              <FileIcon className="w-6 h-6 mr-2 shrink-0" />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">{truncateMiddle(translation.fileName)}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{translation.fileName}</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => onDownloadTranslation(documentId, translation.language)}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              {translation.language}
                            </Button>
                          </div>
                        ))
                      )}

                      {selectedLanguages.length === 0 && (
                        <div className="py-4 text-center text-muted-foreground">
                          <p>No languages were selected for translation.</p>
                          <p className="mt-2">You can still download the original document.</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between pt-2">
              <div>
                {translationCompleted && currentTranslations.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => onDownloadAll(documentId)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download All Translations
                  </Button>
                )}
              </div>
              <Button
                onClick={onDone}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
