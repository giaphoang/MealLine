// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { ChevronRight } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import React from "react";

export function ButtonIconChevron(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button variant="outline" size="icon" {...props}>
      <ChevronRight />
    </Button>
  );
}