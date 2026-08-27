import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '../../../helpers/render'
import MPlacesBulkCategorySheet from '../../../../src/mobile/screens/trip/places/MPlacesBulkCategorySheet'
import type { Category } from '../../../../src/types'

// FE-MOB-PBULK-001 to FE-MOB-PBULK-006

const CATEGORIES = [
  { id: 1, name: 'Sights', color: '#123456', icon: 'landmark' },
  { id: 2, name: 'Food', color: '', icon: 'unknown-icon' },
] as unknown as Category[]

function renderSheet(over: { open?: boolean; count?: number; categories?: Category[] } = {}) {
  const onPickPrimary = vi.fn()
  const onPickAdditional = vi.fn()
  const onClose = vi.fn()
  const view = render(
    <MPlacesBulkCategorySheet
      open={over.open ?? true}
      count={over.count ?? 3}
      categories={over.categories ?? CATEGORIES}
      onPickPrimary={onPickPrimary}
      onPickAdditional={onPickAdditional}
      onClose={onClose}
    />,
  )
  return { ...view, onPickPrimary, onPickAdditional, onClose }
}

describe('MPlacesBulkCategorySheet', () => {
  it('FE-MOB-PBULK-001: titles the sheet and reports how many places the pick applies to', () => {
    renderSheet()
    expect(screen.getByRole('dialog', { name: 'Change category' })).toBeInTheDocument()
    expect(screen.getByText('3 selected')).toBeInTheDocument()
  })

  it('FE-MOB-PBULK-002: lists every category plus the clear-category row', () => {
    renderSheet()
    expect(screen.getByRole('button', { name: 'Sights' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Food' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No Category' })).toBeInTheDocument()
  })

  it('FE-MOB-PBULK-003: hands the picked category id back', () => {
    const { onPickPrimary } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Sights' }))
    expect(onPickPrimary).toHaveBeenCalledWith(1)
  })

  it('FE-MOB-PBULK-004: the clear row picks null', () => {
    const { onPickPrimary } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'No Category' }))
    expect(onPickPrimary).toHaveBeenCalledWith(null)
  })

  it('FE-MOB-PBULK-005: the close button dismisses without picking', () => {
    const { onPickPrimary, onClose } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
    expect(onPickPrimary).not.toHaveBeenCalled()
  })

  it('FE-MOB-PBULK-006: without categories only the clear row remains and it loses its divider', () => {
    renderSheet({ categories: [], count: 1 })
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    const clear = screen.getByRole('button', { name: 'No Category' })
    expect(clear.className).not.toContain('border-t')
    expect(screen.queryByRole('button', { name: 'Sights' })).not.toBeInTheDocument()
  })

  it('FE-MOB-PBULK-007: stays unmounted while closed', () => {
    renderSheet({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
