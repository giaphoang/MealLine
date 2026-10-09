// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

export const formatOrdinalPosition = (position: number): string => {
  const lastTwoDigits = position % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return `${position}th`;
  if (position % 10 === 1) return `${position}st`;
  if (position % 10 === 2) return `${position}nd`;
  if (position % 10 === 3) return `${position}rd`;
  return `${position}th`;
};
