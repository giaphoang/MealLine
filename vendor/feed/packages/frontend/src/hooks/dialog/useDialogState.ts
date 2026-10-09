// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState } from 'react'

/**
 * Interface for the internal state of a dialog
 * @template T The type of data associated with the dialog
 */
export interface DialogState<T> {
  /** Whether the dialog is currently open */
  isOpen: boolean
  /** The data currently associated with the dialog */
  data: T | null
}

/**
 * Hook for managing dialog state with associated data
 * @template T The type of data to be managed with the dialog
 * @returns An object containing dialog state and management functions
 * 
 * @example
 * ```tsx
 * const dialog = useDialogState<UserData>()
 * 
 * // Opening dialog with data
 * const handleEdit = (user: UserData) => {
 *   dialog.open(user)
 * }
 * 
 * // Using in a component
 * <Dialog
 *   open={dialog.isOpen}
 *   onOpenChange={dialog.setOpen}
 * >
 *   {dialog.data && <DialogContent user={dialog.data} />}
 * </Dialog>
 * ```
 */
export function useDialogState<T = undefined>() {
  const [state, setState] = useState<DialogState<T>>({
    isOpen: false,
    data: null
  })

  /**
   * Opens the dialog, optionally with associated data.
   *
   * For dataless dialogs (`useDialogState()`), call `open()` with no
   * argument. For data-carrying dialogs (`useDialogState<User>()`),
   * call `open(user)`.
   *
   * @param data Optional data to associate with the dialog
   */
  const open = (data?: T) => {
    setState({
      isOpen: true,
      data: (data ?? null) as T | null
    })
  }

  /**
   * Closes the dialog and clears its associated data.
   *
   * Careful: if the dialog's JSX is guarded on `data` — `{dialog.data && ...}`
   * — clearing it here unmounts the subtree in the same commit that closes it,
   * so Radix never reaches `data-state="closed"` and the exit animation is
   * skipped (the modal just vanishes). Prefer {@link setOpen}(false) for those,
   * which preserves `data` so the subtree survives long enough to animate out.
   * `close()` is fine for dialogs that are always mounted.
   */
  const close = () => {
    setState({
      isOpen: false,
      data: null
    })
  }

  /**
   * Updates the dialog's open state while preserving its data
   * @param isOpen The new open state
   */
  const setOpen = (isOpen: boolean) => {
    setState(current => ({
      ...current,
      isOpen
    }))
  }

  return {
    isOpen: state.isOpen,
    data: state.data,
    open,
    close,
    setOpen
  }
}
