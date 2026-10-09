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
import { Loader2, FileWarning, AlertTriangle, FileCheck, FileX, FolderArchive } from "@/components/ui/icons";
import { ReconciliationService, ReconciliationResult } from '@/services/document-translator/reconciliation';
import { QuarantineService, QuarantinedFile } from '@/services/document-translator/quarantine';
import { useMessage } from '@/hooks/message/useMessage';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

interface ReconciliationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function ReconciliationDialog({ open, onOpenChange, onComplete }: ReconciliationDialogProps) {
  const { showMessage } = useMessage();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [quarantinedFiles, setQuarantinedFiles] = useState<QuarantinedFile[]>([]);
  const [loadingQuarantined, setLoadingQuarantined] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [progress, setProgress] = useState(0);

  // Extract counts of different issue types
  const getIssueCounts = () => {
    if (!result) return { missing: 0, orphaned: 0, quarantine: quarantinedFiles.length };

    const missing = result.issues.filter(issue => 
      issue.includes('missing') || issue.includes('not found')
    ).length;

    const orphaned = result.actions.filter(action => 
      action.includes('orphaned') || action.includes('quarantine')
    ).length;
    
    // Use actual quarantined file count
    const quarantine = quarantinedFiles.length;

    return { missing, orphaned, quarantine };
  };

  const issueCounts = getIssueCounts();

  // Sort issues by type for better organization
  const categorizeIssues = () => {
    if (!result) return { missingFiles: [], integrityIssues: [], systemErrors: [] };

    const missingFiles = result.issues.filter(issue => 
      issue.includes('missing') || issue.includes('not found')
    );

    const integrityIssues = result.issues.filter(issue => 
      issue.includes('integrity') || issue.includes('mismatch')
    );

    const systemErrors = result.issues.filter(issue => 
      !missingFiles.includes(issue) && !integrityIssues.includes(issue)
    );

    return { missingFiles, integrityIssues, systemErrors };
  };

  const issues = categorizeIssues();

  // Handle triggering the reconciliation
  const handleReconciliation = async () => {
    try {
      setIsLoading(true);
      setProgress(10);
      
      // Simulate progress as we don't have real-time updates from backend
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);
      
      const result = await ReconciliationService.triggerFullReconciliation();
      clearInterval(progressInterval);
      setProgress(100);
      setResult(result);
      
      if (result.status === 'success') {
        showMessage('Storage reconciliation completed successfully', 'success');
      } else {
        showMessage(`Storage reconciliation completed with ${result.issuesCount} issues`, 'warning');
      }
      
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Error triggering reconciliation:', error);
      showMessage('Failed to trigger storage reconciliation', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Load quarantined files
  const loadQuarantinedFiles = async () => {
    try {
      setLoadingQuarantined(true);
      const result = await QuarantineService.getQuarantinedFiles();
      setQuarantinedFiles(result.files);
    } catch (error) {
      console.error('Error loading quarantined files:', error);
      showMessage('Failed to load quarantined files', 'error');
    } finally {
      setLoadingQuarantined(false);
    }
  };

  // Handle clearing all quarantined files
  const handleClearQuarantine = async () => {
    try {
      const result = await QuarantineService.deleteAllQuarantinedFiles();
      showMessage(`${result.count} quarantined files cleared successfully`, 'success');
      // Reload the count
      await loadQuarantinedFiles();
    } catch (error) {
      console.error('Error clearing quarantined files:', error);
      showMessage('Failed to clear quarantined files', 'error');
    }
  };

  // Download a quarantined file
  const handleDownloadQuarantined = (file: QuarantinedFile) => {
    const downloadUrl = QuarantineService.getDownloadUrl(file.type, file.id);
    window.open(downloadUrl, '_blank');
  };

  // Delete a quarantined file
  const handleDeleteQuarantined = async (file: QuarantinedFile) => {
    try {
      await QuarantineService.deleteQuarantinedFile(file.type, file.id);
      showMessage(`File ${file.name} deleted successfully`, 'success');
      // Reload the list
      await loadQuarantinedFiles();
    } catch (error) {
      console.error('Error deleting quarantined file:', error);
      showMessage('Failed to delete quarantined file', 'error');
    }
  };

  // Reset dialog state when closed
  const handleDialogClose = (open: boolean) => {
    if (!open) {
      // Reset all state when dialog is closed
      setResult(null);
      setProgress(0);
      setActiveTab('overview');
      setIsLoading(false);
      setQuarantinedFiles([]);
    }
    onOpenChange(open);
  };
  
  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      // Reset state when dialog is opened
      setResult(null);
      setProgress(0);
      setActiveTab('overview');
      setIsLoading(false);
      setQuarantinedFiles([]);
      
      // Load quarantined files on open to get the count
      loadQuarantinedFiles();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-[700px] h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Storage Reconciliation</DialogTitle>
          <DialogDescription>
            {!result 
              ? 'Run a storage check to identify and fix file integrity issues'
              : result.status === 'success'
                ? 'Storage check completed successfully'
                : `Storage check completed with ${result.issuesCount} issues`
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
                      <FileCheck className="h-4 w-4 mt-0.5 text-[var(--status-success-border)] shrink-0" />
                      <p className="text-sm">Verify all database references to document files are valid</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <FileX className="h-4 w-4 mt-0.5 text-[var(--status-warning-border)] shrink-0" />
                      <p className="text-sm">Find any orphaned files that exist on disk but not in database</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <FolderArchive className="h-4 w-4 mt-0.5 text-[var(--status-danger-border)] shrink-0" />
                      <p className="text-sm">Move orphaned files to quarantine for potential recovery</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-[var(--status-danger-border)] shrink-0" />
                      <p className="text-sm">Flag documents with missing files for administrator attention</p>
                    </div>
                  </CardContent>
                </Card>

                {isLoading && (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-sm">
                      <span>Running storage check...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}

                <p className="text-sm text-muted-foreground">
                  This process can take several minutes to complete depending on the number of documents in the system.
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
                {result.issuesCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {result.issuesCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="actions">
                Actions
                {result.actionsCount > 0 && (
                  <Badge variant="outline" className="ml-2">
                    {result.actionsCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContents className="flex-1 min-h-0">
            <TabsContent value="overview" className="flex-1 min-h-0">
              <div className="flex flex-col gap-4 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className={issueCounts.missing > 0 ? "border-[var(--status-danger-border)]" : ""}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Missing Files</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {issueCounts.missing}
                        </div>
                      </CardContent>
                      <CardFooter className="pt-0">
                        <p className="text-xs text-muted-foreground">
                          {issueCounts.missing > 0 
                            ? "Files referenced in database that cannot be found"
                            : "All referenced files are present"}
                        </p>
                      </CardFooter>
                    </Card>

                    <Card className={issueCounts.orphaned > 0 ? "border-[var(--status-warning-border)]" : ""}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Orphaned Files</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {issueCounts.orphaned}
                        </div>
                      </CardContent>
                      <CardFooter className="pt-0">
                        <p className="text-xs text-muted-foreground">
                          {issueCounts.orphaned > 0 
                            ? "Files on disk not referenced in database"
                            : "No unreferenced files found"}
                        </p>
                      </CardFooter>
                    </Card>

                    <Card className={issueCounts.quarantine > 0 ? "border-[var(--status-neutral-border)]" : ""}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Quarantined</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {issueCounts.quarantine}
                        </div>
                      </CardContent>
                      <CardFooter className="pt-0">
                        <p className="text-xs text-muted-foreground">
                          {issueCounts.quarantine > 0 
                            ? "Files moved to quarantine for safety"
                            : "No files in quarantine"}
                        </p>
                      </CardFooter>
                    </Card>
                  </div>

                  {result.issuesCount > 0 ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Issues Found</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        {issues.missingFiles.length > 0 && (
                          <div className="flex flex-col gap-2">
                            <h4 className="text-sm font-semibold flex items-center">
                              <FileWarning className="inline h-4 w-4 mr-2 text-[var(--status-danger-border)]" />
                              Missing Files ({issues.missingFiles.length})
                            </h4>
                            {/* Native max-h grow-to-fit is intentional for the
                                bordered preview boxes in this dialog
                                (shadcn-exception, per AGENTS.md / ISSUES.md
                                #32): they list a variable, often-tiny number of
                                issues/actions, so a fixed-height ScrollArea
                                would render mostly-empty boxes. They grow to the
                                content and scroll only past the cap. */}
                            <div className="max-h-[10vh] sm:max-h-[60px] overflow-auto rounded-md border p-3">
                              {issues.missingFiles.map((issue, i) => (
                                <React.Fragment key={i}>
                                  <div className="text-sm text-muted-foreground">
                                    {issue.includes(' at ') 
                                      ? `File not found: ${issue.split(' at ')[1]}` 
                                      : issue}
                                  </div>
                                  {i < issues.missingFiles.length - 1 && <Separator className="my-2" />}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        )}

                        {issues.integrityIssues.length > 0 && (
                          <div className="flex flex-col gap-2">
                            <h4 className="text-sm font-semibold flex items-center">
                              <AlertTriangle className="inline h-4 w-4 mr-2 text-[var(--status-warning-border)]" />
                              Integrity Issues ({issues.integrityIssues.length})
                            </h4>
                            <div className="max-h-[30vh] sm:max-h-[250px] overflow-auto rounded-md border p-3">
                              {issues.integrityIssues.map((issue, i) => (
                                <React.Fragment key={i}>
                                  <div className="text-sm text-muted-foreground">{issue}</div>
                                  {i < issues.integrityIssues.length - 1 && <Separator className="my-2" />}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="border-[var(--status-success-border)]">
                      <CardHeader>
                        <CardTitle className="text-base">Storage Check Results</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-[color-mix(in_oklab,var(--status-success-bg)_40%,transparent)] flex items-center justify-center">
                            <FileCheck className="h-5 w-5 text-[var(--status-success-border)]" />
                          </div>
                          <div>
                            <p className="text-[var(--status-success-text)] font-medium">All checks passed</p>
                            <p className="text-sm text-muted-foreground">
                              No issues found. Storage is in sync with database.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Note: Orphaned files are automatically moved to quarantine during reconciliation */}

                  {issueCounts.quarantine > 0 && (
                    <div className="flex justify-end">
                      <Button 
                        variant="outline" 
                        onClick={handleClearQuarantine}
                        disabled={issueCounts.quarantine === 0}
                      >
                        Clear All Quarantined Files ({issueCounts.quarantine})
                      </Button>
                    </div>
                  )}
                </div>
            </TabsContent>

            <TabsContent value="actions" className="flex-1 min-h-0">
              <div className="flex flex-col gap-4 p-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Actions Taken</CardTitle>
                      <CardDescription>
                        {result.actionsCount > 0 
                          ? `${result.actionsCount} actions were performed during reconciliation`
                          : 'No actions were needed during reconciliation'}
                      </CardDescription>
                    </CardHeader>
                    
                    {issueCounts.quarantine > 0 && (
                      <div className="px-6 pb-4">
                        <div className="p-3 rounded border bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-[var(--status-warning-text)] flex items-center">
                              <FolderArchive className="h-4 w-4 mr-2 text-[var(--status-warning-border)]" />
                              {issueCounts.quarantine} {issueCounts.quarantine === 1 ? 'file' : 'files'} in quarantine
                            </p>
                            <p className="text-xs text-[var(--status-warning-text)] mt-1">These files were moved to quarantine during reconciliation</p>
                          </div>
                          <Button 
                            variant="outline"
                            size="sm"
                            onClick={handleClearQuarantine}
                            className="text-[var(--status-warning-text)]! border-[var(--status-warning-border)]! bg-transparent! hover:bg-[color-mix(in_oklab,var(--status-warning-bg)_70%,transparent)]!"
                          >
                            Clear All
                          </Button>
                        </div>
                      </div>
                    )}
                    {result.actionsCount > 0 && (
                      <CardContent>
                        <div className="max-h-[30vh] sm:max-h-[260px] overflow-auto rounded-md border p-3">
                          {result.actions.map((action, index) => (
                            <React.Fragment key={index}>
                              <div className="text-sm">
                                {action.includes('quarantine') ? (
                                  <span className="flex items-start gap-2">
                                    <FolderArchive className="h-4 w-4 mt-0.5 text-[var(--status-neutral-border)] shrink-0" />
                                    <span>Moved orphaned file to protected storage</span>
                                  </span>
                                ) : action.includes('metadata') ? (
                                  <span className="flex items-start gap-2">
                                    <FileCheck className="h-4 w-4 mt-0.5 text-[var(--status-success-border)] shrink-0" />
                                    <span>Updated file metadata for better tracking</span>
                                  </span>
                                ) : (
                                  <span className="flex items-start gap-2">
                                    <FileCheck className="h-4 w-4 mt-0.5 text-[var(--status-success-border)] shrink-0" />
                                    <span>{action}</span>
                                  </span>
                                )}
                              </div>
                              {index < result.actions.length - 1 && <Separator className="my-2" />}
                            </React.Fragment>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                </div>
            </TabsContent>

            <TabsContent value="details" className="flex-1 min-h-0">
              <div className="flex flex-col gap-4 p-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Technical Details</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Status Information</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 wrap-break-word">
                          <div className="text-sm font-medium">Result Status</div>
                          <div className="text-sm">{result.status}</div>
                          
                          <div className="text-sm font-medium">Actions Performed</div>
                          <div className="text-sm">{result.actionsCount}</div>
                          
                          <div className="text-sm font-medium">Issues Detected</div>
                          <div className="text-sm">{result.issuesCount}</div>
                        </div>
                      </div>

                      {result.issuesCount > 0 && (
                        <div className="flex flex-col gap-2">
                          <h4 className="text-sm font-semibold">All Issues</h4>
                            <div className="max-h-[30vh] sm:max-h-[54px] overflow-auto rounded-md border p-3 overflow-x-hidden">
                              {result.issues.map((issue, index) => (
                                <React.Fragment key={index}>
                                  <div className="text-sm text-muted-foreground break-all">{issue}</div>
                                  {index < result.issues.length - 1 && <Separator className="my-2" />}
                                </React.Fragment>
                              ))}
                            </div>
                        </div>
                      )}

                      {result.actionsCount > 0 && (
                        <div className="flex flex-col gap-2">
                          <h4 className="text-sm font-semibold">All Actions</h4>
                            <div className="max-h-[30vh] sm:max-h-[40px] overflow-auto rounded-md border p-3 overflow-x-hidden">
                              {result.actions.map((action, index) => (
                                <React.Fragment key={index}>
                                  <div className="text-sm text-muted-foreground break-all">{action}</div>
                                  {index < result.actions.length - 1 && <Separator className="my-2" />}
                                </React.Fragment>
                              ))}
                            </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
            </TabsContent>
            </TabsContents>

          </Tabs>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-2 pt-2">
          {!result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={handleReconciliation} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Running Check...' : 'Run Storage Check'}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
