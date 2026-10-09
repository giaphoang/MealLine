// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';

export type TerminologySettings = {
  pantrySingular: string;
  pantryPlural: string;
  clientSingular: string;
  clientPlural: string;
  departmentName: string;
  active: boolean;
};

export const DEFAULT_TERMINOLOGY: TerminologySettings = {
  pantrySingular: 'food pantry',
  pantryPlural: 'food pantries',
  clientSingular: 'client',
  clientPlural: 'clients',
  departmentName: 'Social Services',
  active: true,
};

const capitalize = (value: string) => value.length ? `${value[0].toUpperCase()}${value.slice(1)}` : value;

/**
 * Replaces complete placeholders rather than concatenating fragments. This
 * keeps configured multi-word and irregular terms grammatical at each call
 * site and leaves unknown placeholders visible for developer diagnosis.
 */
export const formatTerminology = (
  template: string,
  settings: TerminologySettings = DEFAULT_TERMINOLOGY,
): string => {
  const active = settings.active ? settings : DEFAULT_TERMINOLOGY;
  const values: Record<string, string> = {
    pantry: active.pantrySingular,
    pantries: active.pantryPlural,
    client: active.clientSingular,
    clients: active.clientPlural,
    department: active.departmentName,
    Pantry: capitalize(active.pantrySingular),
    Pantries: capitalize(active.pantryPlural),
    Client: capitalize(active.clientSingular),
    Clients: capitalize(active.clientPlural),
    Department: capitalize(active.departmentName),
  };
  return template.replace(/\{(pantry|pantries|client|clients|department|Pantry|Pantries|Client|Clients|Department)\}/g,
    (placeholder, key: string) => values[key] ?? placeholder);
};

export type TerminologyPhraseBook = ReturnType<typeof createTerminologyPhraseBook>;

export const createTerminologyPhraseBook = (settings: TerminologySettings) => {
  const format = (template: string) => formatTerminology(template, settings);
  return {
    settings: settings.active ? settings : DEFAULT_TERMINOLOGY,
    format,
    pantryServiceDay: format('{pantry} service day'),
    pantryServiceDays: format('{pantry} service days'),
    pantryData: format('{pantry} data'),
    totalClients: format('Total {clients}'),
    noClients: format('No {clients} found'),
    availableToClients: format('available to {clients}'),
  };
};

const TerminologyContext = React.createContext<TerminologyPhraseBook>(
  createTerminologyPhraseBook(DEFAULT_TERMINOLOGY),
);

export const TerminologyProvider = ({ settings, children }: {
  settings: TerminologySettings;
  children: React.ReactNode;
}) => (
  <TerminologyContext.Provider value={React.useMemo(
    () => createTerminologyPhraseBook(settings),
    [settings],
  )}>
    {children}
  </TerminologyContext.Provider>
);

export const useTerminology = () => React.useContext(TerminologyContext);
