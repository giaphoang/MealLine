// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

// Header-only contracts are isolated from parsers and database services so the
// global Add Data classifier can inspect files without initializing a domain.
export const OFB_HEADERS = [
  'Date',
  'Period',
  'Order #',
  'Product #',
  'Product Description',
  'Category',
  'Qty',
  'Weight',
  'Unit Price',
  'Price Total',
  'Service Fee',
  'Grants Applied',
] as const;

export const FRESH_ALLIANCE_HEADERS = [
  'Date',
  'Period',
  'Pickup Time',
  'Pickup ID',
  'Pickup Reference',
  'Pickup Line ID',
  'Donor Code',
  'Donor Name',
  'Product #',
  'Product Description',
  'Category',
  'Fresh Alliance Category',
  'Qty',
  'Weight',
  'Received Qty',
  'Received Weight',
  'Temperature',
  'Submitted Date/Time',
  'Donor Value Per Pound',
] as const;

export const UNIFIED_HEADERS = [
  'Schema Version',
  'Record Type',
  'Confirmed',
  'Date',
  'Period',
  'Source Reference',
  'Product #',
  'Product Description',
  'Category',
  'Qty',
  'Weight',
  'Unit Price',
  'Price Total',
  'Service Fee',
  'Grants Applied',
  'Pickup Time',
  'Pickup ID',
  'Pickup Line ID',
  'Donor Code',
  'Donor Name',
  'Fresh Alliance Category',
  'Received Qty',
  'Received Weight',
  'Temperature',
  'Submitted Date/Time',
  'Donor Value Per Pound',
] as const;

export const LEGACY_LEDGER_HEADERS = [
  'calendar_year',
  'month_num',
  'month',
  'source_canonical',
  'disposition',
  'in_ofb',
  'weight_pounds',
  'source_as_written',
  'fiscal_year',
  'source_file',
  'caveat',
] as const;
