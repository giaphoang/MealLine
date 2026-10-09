// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

const fs = require('node:fs');
const path = require('node:path');

const backendLib = __dirname;
const repoRoot = path.resolve(backendLib, '../../../..');
const registryPath = path.join(repoRoot, 'packages/frontend/src/lib/food-icons.ts');
const outputPath = path.join(backendLib, 'icon-svgs.ts');
const frontendModules = path.join(repoRoot, 'packages/frontend/node_modules');
const React = require(path.join(frontendModules, 'react'));
const { renderToStaticMarkup } = require(path.join(frontendModules, 'react-dom/server'));
const lucide = require(path.join(frontendModules, 'lucide-react'));

const registry = fs.readFileSync(registryPath, 'utf8');
const entryPattern = /\{\s*value:\s*'([^']+)',\s*label:\s*'[^']+',\s*category:\s*'([^']+)',\s*component:\s*([A-Za-z0-9]+)\s*\}/g;
const entries = [...registry.matchAll(entryPattern)].map((match) => ({
  value: match[1],
  category: match[2],
  componentName: match[3],
}));

if (entries.length === 0) {
  throw new Error(`No icon entries were found in ${registryPath}.`);
}

const duplicateValues = entries
  .map((entry) => entry.value)
  .filter((value, index, values) => values.indexOf(value) !== index);
if (duplicateValues.length > 0) {
  throw new Error(`Duplicate icon values: ${[...new Set(duplicateValues)].join(', ')}`);
}

const categoryLabels = {
  food: 'Food',
  drink: 'Drink',
  health: 'Health',
  household: 'Household',
  clothing: 'Clothing',
  pets: 'Animals & Pets',
  shapes: 'Shapes & Symbols',
  outdoor: 'Outdoors',
  other: 'Other',
};

const lines = [];
let previousCategory = null;
for (const entry of entries) {
  if (entry.category !== previousCategory) {
    if (previousCategory !== null) lines.push('');
    lines.push(`  // ${categoryLabels[entry.category] ?? entry.category}`);
    previousCategory = entry.category;
  }

  const Component = lucide[entry.componentName];
  if (!Component) {
    throw new Error(`Lucide export ${entry.componentName} is unavailable for ${entry.value}.`);
  }
  const svg = renderToStaticMarkup(React.createElement(Component));
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  lines.push(`  ${JSON.stringify(entry.value)}: ${JSON.stringify(inner)},`);
}

const output = `// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * SVG inner-content strings for every icon in the shared icon registry
 * (packages/frontend/src/lib/food-icons.ts).
 *
 * Generated from FEED's installed lucide-react version. Do not edit by hand.
 * Regenerate after changing the registry or Lucide version:
 *
 *   node packages/backend/src/lib/generate-icon-svgs.cjs
 */
export const FOOD_ICON_SVG_PATHS: Record<string, string> = {
${lines.join('\n')}
};
`;

fs.writeFileSync(outputPath, output);
console.log(`Generated ${entries.length} icon SVG entries at ${outputPath}.`);
