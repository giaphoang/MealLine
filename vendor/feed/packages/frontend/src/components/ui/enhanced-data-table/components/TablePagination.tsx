// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react"
import { Table } from "@tanstack/react-table"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "@/components/ui/icons";

interface TablePaginationProps<TData> {
  table: Table<TData>
  pageSize?: number
  onPageSizeChange?: (pageSize: number) => void
}

export function TablePagination<TData>({
  table,
  pageSize = 5,
  onPageSizeChange,
}: TablePaginationProps<TData>) {
  const totalRows = table.getFilteredRowModel().rows.length
  const totalPages = Math.ceil(totalRows / pageSize)
  const currentPage = table.getState().pagination.pageIndex + 1
  const currentPageSize = table.getState().pagination.pageSize

  // Handle page size change
  const handlePageSizeChange = (value: string) => {
    const newSize = parseInt(value, 10)
    table.setPageSize(newSize)
    if (onPageSizeChange) {
      onPageSizeChange(newSize)
    }
  }

  // Calculate the range of page numbers to display
  const getPageRange = () => {
    const range: (number | 'ellipsis')[] = []
    const maxVisiblePages = 5

    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    // Always show first page
    range.push(1)

    if (currentPage > 3) {
      range.push('ellipsis')
    }

    // Calculate middle range
    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)

    for (let i = start; i <= end; i++) {
      range.push(i)
    }

    if (currentPage < totalPages - 2) {
      range.push('ellipsis')
    }

    // Always show last page
    if (totalPages > 1) {
      range.push(totalPages)
    }

    return range
  }

  return (
    <div className="flex flex-col space-y-4">
      {/* Top row with row selection and page size selector on same line */}
      <div className="flex flex-row justify-between items-center">
        {/* Left: Selection status */}
        <div className="text-sm text-muted-foreground text-left whitespace-nowrap">
          {table.getFilteredSelectedRowModel().rows.length} of {totalRows} row(s) selected.
        </div>
        
        {/* Right: Row size selector */}
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className="h-8"
                data-testid="rows-per-page-selector"
              >
                {currentPageSize} rows <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel>Rows per page</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={currentPageSize.toString()}
                onValueChange={handlePageSizeChange}
              >
                <DropdownMenuRadioItem value="5">5 rows</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="10">10 rows</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="25">25 rows</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="50">50 rows</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="100">100 rows</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {/* Bottom row with centered pagination controls */}
      <div className="flex justify-center w-full">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  table.previousPage()
                }}
                aria-disabled={!table.getCanPreviousPage()}
                className={!table.getCanPreviousPage() ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>

            {getPageRange().map((page, index) => (
              <PaginationItem key={index}>
                {page === 'ellipsis' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      table.setPageIndex(page - 1)
                    }}
                    isActive={currentPage === page}
                    aria-current={currentPage === page ? "page" : undefined}
                  >
                    {page}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  table.nextPage()
                }}
                aria-disabled={!table.getCanNextPage()}
                className={!table.getCanNextPage() ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}