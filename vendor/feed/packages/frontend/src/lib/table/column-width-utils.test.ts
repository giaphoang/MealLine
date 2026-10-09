import { describe, expect, it } from 'vitest'

import { calculateVisibleColumnWidths } from './column-width-utils'

describe('calculateVisibleColumnWidths', () => {
  it('gives a sole mobile content column all space between fixed edge columns', () => {
    const widths = calculateVisibleColumnWidths([
      { id: 'select', size: 10, isFixed: true },
      { id: 'name', size: 250 },
      { id: 'actions', size: 100, isFixed: true },
    ])

    expect(widths.select.width).toBe('32px')
    expect(widths.name.width).toBe('calc(100.00% - 104.00px)')
    expect(widths.actions.width).toBe('72px')
  })

  it('shares remaining space proportionally between visible content columns', () => {
    const widths = calculateVisibleColumnWidths([
      { id: 'select', size: 10, isFixed: true },
      { id: 'name', size: 300 },
      { id: 'status', size: 100 },
      { id: 'actions', size: 100, isFixed: true },
    ])

    expect(widths.name.width).toBe('calc(75.00% - 78.00px)')
    expect(widths.status.width).toBe('calc(25.00% - 26.00px)')
  })
})
