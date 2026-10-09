// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FolderSync } from "@/components/ui/icons";
import { ReconciliationDialog } from './dialogs/reconciliation-dialog';

/**
 * Button component for triggering storage reconciliation manually
 */
const ReconciliationButton: React.FC = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <Button 
        variant="outline" 
        onClick={() => setIsDialogOpen(true)}
        className="w-full"
      >
        <FolderSync className="mr-2 h-4 w-4" />
        Run Storage Check
      </Button>
      
      <ReconciliationDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
      />
    </>
  );
};

export default ReconciliationButton;