// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useState } from 'react'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { LanguageFilter } from "./language-filter"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useLanguageContext } from "@/contexts/LanguageContext"
import { ButtonIconX } from "@/components/ui/button-icon-x"
import { LanguageWarningDialog } from "./language-warning-dialog"
import { LanguageDeactivationDialog, DeactivationAction } from "./language-deactivation-dialog"
import { LanguageService } from '@/services/language'
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService'
import type { ActiveModelLanguageCoverage } from '@/types/language'

const languageService = new LanguageService()

const FormSchema = z.object({
  languages: z.array(z.string()).refine((value) => value.includes('English'), {
    message: "English must be selected as it is the default language.",
  }),
})

export function LanguageSelectionForm() {
  const { languages, updateLanguages, isLoading, isSaving, getTranslationCount } = useLanguageContext()
  const [search, setSearch] = useState("")
  const [showWarning, setShowWarning] = useState(false)
  const [showDeactivationDialog, setShowDeactivationDialog] = useState(false)
  const [deactivatedLanguages, setDeactivatedLanguages] = useState<string[]>([])
  const [translationCount, setTranslationCount] = useState(0)
  const [pendingData, setPendingData] = useState<z.infer<typeof FormSchema> | null>(null)
  const [activeModel, setActiveModel] = useState<ActiveModelLanguageCoverage | null>(null)

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      languages: languages.filter(lang => lang.isEnabled).map(lang => lang.name)
    },
  })

  // Reset form when languages change
  React.useEffect(() => {
    if (!isLoading && languages.length > 0) {
      form.reset({
        languages: languages.filter(lang => lang.isEnabled).map(lang => lang.name)
      });
    }
  }, [languages, isLoading, form]);

  React.useEffect(() => {
    let cancelled = false

    languageService.getActiveModelCoverage()
      .then((model) => {
        if (!cancelled) setActiveModel(model)
      })
      .catch((error) => ErrorHandlerService.handleError(error, 'fetchLanguageModelCoverage'))

    return () => {
      cancelled = true
    }
  }, [])

  async function handleWarningConfirm() {
    if (!pendingData) return;
    
    await updateLanguages(pendingData.languages);
    setPendingData(null);
  }
  
  async function handleDeactivationAction(action: DeactivationAction) {
    if (!pendingData) return;
    
    if (action === 'cancel') {
      // Reset form to current state
      form.reset({
        languages: languages.filter(lang => lang.isEnabled).map(lang => lang.name)
      });
      setPendingData(null);
      setShowDeactivationDialog(false); // Ensure dialog is closed
      return;
    }
    
    // If 'deactivate', preserve translations
    // If 'deactivateAndDelete', delete translations
    const preserveTranslations = action === 'deactivate';
    await updateLanguages(pendingData.languages, preserveTranslations);
    setPendingData(null);
    
    // Close the dialog for both deactivate and deactivateAndDelete actions
    if (action === 'deactivateAndDelete') {
      setShowDeactivationDialog(false);
    }
    // Note: For 'deactivate' action, the dialog is closed by the LanguageDeactivationDialog component
  }

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    const currentEnabledLanguages = languages
      .filter(lang => lang.isEnabled)
      .map(lang => lang.name);
    
    const newEnabledLanguages = data.languages;
    
    // Find languages that are being deactivated
    const deactivatingLanguages = currentEnabledLanguages.filter(
      name => !newEnabledLanguages.includes(name)
    );
    
    // If there are languages being deactivated, show the deactivation dialog
    if (deactivatingLanguages.length > 0) {
      setDeactivatedLanguages(deactivatingLanguages);
      // Get translation count for the languages being deactivated
      const count = await getTranslationCount(deactivatingLanguages);
      setTranslationCount(count);
      setPendingData(data);
      setShowDeactivationDialog(true);
      return;
    }
    
    // If there are no languages being deactivated, check for warning threshold
    const selectedCount = data.languages.length;
    if (selectedCount >= 10 && !pendingData) {
      setPendingData(data);
      setShowWarning(true);
      return;
    }
    
    await updateLanguages(data.languages);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-card text-card-foreground rounded-md border p-4">
        <p className="text-muted-foreground">Loading languages...</p>
      </div>
    )
  }

  // Filter languages based on search
  const filteredLanguages = languages.filter(lang =>
    lang.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 text-foreground">
        <FormField
          control={form.control}
          name="languages"
          render={({ field }) => (
            <FormItem>

              <div className="flex flex-col gap-4">
                <div className="w-full">
                  <LanguageFilter
                    languages={languages}
                    value={search}
                    onValueChange={setSearch}
                    disabled={isLoading || isSaving}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {field.value.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {field.value.length} selected
                      </span>
                      <ButtonIconX
                        variant="ghost"
                        size="sm"
                        onClick={() => field.onChange(['English'])}
                        className="h-7"
                        disabled={isLoading || isSaving || field.value.length <= 1}
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const allNames = filteredLanguages.map(lang => lang.name);
                      field.onChange(allNames);
                    }}
                    disabled={isLoading || isSaving}
                    className="h-7"
                  >
                    Select All
                  </Button>
                </div>
              </div>
              <div className="mt-2 mb-4">
                <p className="text-sm text-muted-foreground">
                  Select the languages to make available for translation. English is required and cannot be disabled.
                </p>
              </div>
              <ScrollArea className="h-[300px] rounded-md border bg-card text-card-foreground">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 p-4">
                  {filteredLanguages.map((language) => {
                    const coverage = activeModel?.languages[language.name]
                    return (
                      <FormField
                        key={language.name}
                        control={form.control}
                        name="languages"
                        render={({ field }) => (
                          <FormItem
                            key={language.name}
                            className="flex flex-row items-start space-x-3 space-y-0"
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(language.name)}
                                disabled={language.name === 'English' || isLoading || isSaving}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...field.value, language.name])
                                    : field.onChange(
                                        field.value?.filter(
                                          (value) => value !== language.name
                                        )
                                      )
                                }}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none text-card-foreground">
                              <label
                                className={`text-sm ${
                                  language.name === 'English' ? 'font-medium' : ''
                                }`}
                              >
                                {language.name}
                                {language.name === 'English' && ' (Required)'}
                              </label>
                              {field.value?.includes(language.name) && coverage === 'unsupported' && (
                                <p role="note" className="text-xs leading-snug text-destructive">
                                  Not supported by {activeModel?.displayName}
                                </p>
                              )}
                              {field.value?.includes(language.name) && coverage === 'supported' && (
                                <p role="note" className="text-xs leading-snug text-[var(--status-warning-text)]">
                                  Supported; not yet live-tested
                                </p>
                              )}
                            </div>
                          </FormItem>
                        )}
                      />
                    )
                  })}
                </div>
              </ScrollArea>
              <FormMessage />
              <div className="mt-4 flex justify-end">
                <Button 
                  type="submit" 
                  size="sm" 
                  disabled={isLoading || isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </FormItem>
          )}
        />
      </form>
      <LanguageWarningDialog
        open={showWarning}
        onOpenChange={setShowWarning}
        onConfirm={handleWarningConfirm}
        selectedCount={pendingData?.languages.length || 0}
        isLoading={isSaving}
      />
      <LanguageDeactivationDialog
        open={showDeactivationDialog}
        onOpenChange={setShowDeactivationDialog}
        onAction={handleDeactivationAction}
        deactivatedLanguages={deactivatedLanguages}
        translationCount={translationCount}
        isLoading={isSaving}
      />
    </Form>
  )
}
