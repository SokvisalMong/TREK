import { createPortal } from 'react-dom'
import { useState } from 'react'
import { X, MapPin } from 'lucide-react'
import { getCategoryIcon } from '../shared/categoryIcons'
import { useTranslation } from '../../i18n'
import type { Category } from '../../types'

interface PlacesBulkCategoryModalProps {
  count: number
  categories: Category[]
  onPickPrimary: (categoryId: number | null) => void
  onPickAdditional: (categoryIds: number[]) => void
  onClose: () => void
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
  padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 'calc(13px * var(--fs-scale-body, 1))', textAlign: 'left',
}
const hoverOn = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--bg-hover)' }
const hoverOff = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'transparent' }

/**
 * Popup for the Places selection toolbar: pick one category to apply to every
 * currently-selected place. Reuses the category swatch styling from the header's
 * filter dropdown; clicking a row applies immediately and closes.
 */
export function PlacesBulkCategoryModal({
  count,
  categories,
  onPickPrimary,
  onPickAdditional,
  onClose,
}: PlacesBulkCategoryModalProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'primary' | 'additional'>('primary')
  const [additionalCategoryIds, setAdditionalCategoryIds] = useState<number[]>([])

  const toggleAdditional = (categoryId: number) => {
    setAdditionalCategoryIds(current =>
      current.includes(categoryId) ? current.filter(id => id !== categoryId) : [...current, categoryId],
    )
  }

  return createPortal(
    <div
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div className="bg-surface-card text-content" style={{
        borderRadius: 14, padding: '18px 20px', width: '100%', maxWidth: 380,
        boxShadow: '0 16px 48px rgba(0,0,0,0.22)', border: '1px solid var(--border-faint)', fontFamily: 'inherit',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{t('places.changeCategory')}</span>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="text-content-muted" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        <p className="text-content-faint" style={{ fontSize: 12, marginBottom: 12 }}>{t('places.selectionCount', { count })}</p>

        <div className="bg-surface-muted" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, padding: 3, borderRadius: 9, marginBottom: 12 }}>
          {(['primary', 'additional'] as const).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={mode === option ? 'bg-surface-card text-content' : 'bg-transparent text-content-muted'}
              style={{ border: 'none', borderRadius: 7, padding: '6px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: mode === option ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}
            >
              {t(option === 'primary' ? 'places.primaryCategory' : 'places.formAdditionalCategories')}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 300, overflowY: 'auto' }}>
          {categories.map(category => {
            const CatIcon = getCategoryIcon(category.icon)
            const selected = additionalCategoryIds.includes(category.id)
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => (mode === 'primary' ? onPickPrimary(category.id) : toggleAdditional(category.id))}
                className={`text-content ${selected && mode === 'additional' ? 'bg-surface-hover' : 'bg-transparent'}`}
                style={rowStyle}
                onMouseEnter={hoverOn}
                onMouseLeave={hoverOff}
              >
                <CatIcon size={14} strokeWidth={2} color={category.color || 'var(--text-muted)'} />
                <span style={{ flex: 1 }}>{category.name}</span>
                {mode === 'additional' && (
                  <span aria-hidden="true" style={{
                    width: 16, height: 16, borderRadius: 5,
                    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    background: selected ? 'var(--accent)' : 'transparent', color: 'white',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && '✓'}
                  </span>
                )}
              </button>
            )
          })}
          {mode === 'primary' && (
            <button
              type="button"
              onClick={() => onPickPrimary(null)}
              className="bg-transparent text-content-muted"
              style={{ ...rowStyle, borderTop: categories.length > 0 ? '1px solid var(--border-faint)' : 'none', marginTop: categories.length > 0 ? 2 : 0 }}
              onMouseEnter={hoverOn}
              onMouseLeave={hoverOff}
            >
              <MapPin size={14} strokeWidth={2} color="var(--text-faint)" />
              <span style={{ flex: 1 }}>{t('places.noCategory')}</span>
            </button>
          )}
        </div>

        {mode === 'additional' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => setAdditionalCategoryIds([])} className="btn-secondary" style={{ fontSize: 12 }}>
              {t('common.clear')}
            </button>
            <button type="button" onClick={() => onPickAdditional(additionalCategoryIds)} className="btn-primary" style={{ fontSize: 12 }}>
              {t('common.save')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
