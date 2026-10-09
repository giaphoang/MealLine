// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react"
import { Check, ChevronDown } from "@/components/ui/icons";
import { LanguageConfig } from "@/config/language-config"
import { cn, normalizeLanguage } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface LanguageFilterProps {
  value?: string
  onChange: (value: string) => void
  className?: string
  availableLanguages?: string[]
}

export function LanguageFilter({ value, onChange, className, availableLanguages }: LanguageFilterProps) {
  const [open, setOpen] = React.useState(false)

  const handleLanguageSelect = (language: { name: string }) => {
    // Pass the full language name instead of the code
    onChange(language.name);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-8", className)}
          data-testid="language-filter-button"
        >
          {value ? getLanguageName(value) : "Languages"} <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="end">
        <Command>
          <CommandInput
            placeholder="Search languages..."
          />
          <CommandList>
            <CommandEmpty>No language found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                key="all-languages"
                value="all-languages"
                onSelect={() => {

                  onChange("");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    !value ? "opacity-100" : "opacity-0"
                  )}
                />
                All Languages
              </CommandItem>
              {/* Determine which languages to show */}
              {(availableLanguages?.length ? 
                // Filter SUPPORTED_LANGUAGES to only include those in availableLanguages
                LanguageConfig.SUPPORTED_LANGUAGES.filter(language => 
                  availableLanguages.includes(language.name)
                ) : 
                // If no available languages provided, show all supported languages
                LanguageConfig.SUPPORTED_LANGUAGES
              ).map((language) => (
                <CommandItem
                  key={language.name}
                  value={language.name.toLowerCase()}
                  onSelect={() => handleLanguageSelect(language)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === language.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {language.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function getLanguageName(value: string): string {
  // Check if this is a valid language name
  const language = LanguageConfig.SUPPORTED_LANGUAGES.find(
    lang => lang.name === value
  );
  
  // Return the validated name or the original value
  return language ? language.name : value;
}