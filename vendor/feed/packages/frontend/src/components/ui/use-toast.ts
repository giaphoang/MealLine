// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"
import { computeMessageDuration } from "@/services/message/types"

const TOAST_LIMIT = 3
// Delay between a toast being dismissed (open=false → slide-out animation
// starts) and it being removed from state. Just long enough to cover the
// exit animation. The Shadcn stock value was 1_000_000ms (~16 min), which
// leaked dismissed toasts in memory; visibility is governed by the
// length-aware auto-dismiss timer below, not this cleanup delay.
const TOAST_REMOVE_DELAY = 1000

// Fallback when a toast has no explicit duration and no readable text to
// measure (e.g. a non-string ReactNode description).
const FALLBACK_TOAST_DURATION_MS = 6000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

// Wall-clock auto-dismiss timers, keyed by toast id. This is the SINGLE source
// of toast visibility duration (ISSUES.md #44). It runs independently of Radix
// Toast's own timer — which we disable (duration={Infinity} in toaster.tsx) —
// because Radix pauses its timer on hover/focus/pointer-down and never resumes
// after a touch tap, leaving tapped toasts stuck open indefinitely. A plain
// setTimeout cannot be paused by pointer events, so a toast lives for exactly
// its duration regardless of clicks, taps, or hover.
const dismissTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const clearDismissTimer = (toastId: string) => {
  const timer = dismissTimeouts.get(toastId)
  if (timer) {
    clearTimeout(timer)
    dismissTimeouts.delete(toastId)
  }
}

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        clearDismissTimer(toastId)
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          clearDismissTimer(toast.id)
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()

  const update = (props: Toast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  // Start the single, time-only auto-dismiss timer (ISSUES.md #44).
  // - duration === null            → persist until manually dismissed
  // - duration is a finite number  → use it verbatim
  // - duration is undefined        → length-aware default from the message text
  // Infinity / non-finite values also persist (defensive).
  if (props.duration !== null) {
    let ms: number
    if (typeof props.duration === "number" && Number.isFinite(props.duration)) {
      ms = props.duration
    } else if (props.duration === undefined) {
      ms = typeof props.description === "string"
        ? computeMessageDuration(props.description)
        : FALLBACK_TOAST_DURATION_MS
    } else {
      ms = Number.POSITIVE_INFINITY
    }

    if (Number.isFinite(ms)) {
      dismissTimeouts.set(id, setTimeout(dismiss, ms))
    }
  }

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
