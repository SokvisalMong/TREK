import { Check, MapPin, X } from 'lucide-react'
import { useState } from 'react'
import MSheet from '../../../components/MSheet'
import MIconBtn from '../../../components/MIconBtn'
import { getCategoryIcon } from '../../../../components/shared/categoryIcons'
import { useTranslation } from '../../../../i18n'
import type { Category } from '../../../../types'

interface MPlacesBulkCategorySheetProps {
  open: boolean
  count: number
  categories: Category[]
  onPickPrimary: (categoryId: number | null) => void
  onPickAdditional: (categoryIds: number[]) => void
  onClose: () => void
}

/**
 * Category picker of the places-pool selection toolbar: one tap applies the
 * category to every selected place (mobile counterpart of
 * PlacesBulkCategoryModal).
 */
export default function MPlacesBulkCategorySheet({
  open,
  count,
  categories,
  onPickPrimary,
  onPickAdditional,
  onClose,
}: MPlacesBulkCategorySheetProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'primary' | 'additional'>('primary')
  const [additionalCategoryIds, setAdditionalCategoryIds] = useState<number[]>([])

  const toggleAdditional = (categoryId: number) => {
    setAdditionalCategoryIds(current =>
      current.includes(categoryId) ? current.filter(id => id !== categoryId) : [...current, categoryId],
    )
  }

  return (
    <MSheet open={open} onClose={onClose} variant="card" ariaLabel={t('places.changeCategory')}>
      <div className="flex flex-none items-center border-b border-[color:var(--m-rowbr)] px-[18px] pb-[11px] pt-4">
        <div className="min-w-0 flex-1">
          <div className="text-[1.03125rem] font-bold text-m-ink">{t('places.changeCategory')}</div>
          <div className="mt-[2px] font-geist text-[0.6875rem] text-m-muted">{t('places.selectionCount', { count })}</div>
        </div>
        <MIconBtn variant="neutral" size={34} onClick={onClose} ariaLabel={t('common.close')}>
          <X size={15} strokeWidth={2.2} />
        </MIconBtn>
      </div>

      <div className="bg-[color:var(--m-ic)] p-1">
        <div className="grid grid-cols-2 gap-1">
          {(['primary', 'additional'] as const).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={`rounded-lg px-2 py-2 text-[0.71875rem] font-semibold ${mode === option ? 'bg-m-act text-m-actfg' : 'text-m-muted'}`}
            >
              {t(option === 'primary' ? 'places.primaryCategory' : 'places.formAdditionalCategories')}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[10px] pb-3 pt-[6px]">
        {categories.map(category => {
          const selected = additionalCategoryIds.includes(category.id)
          const CatIcon = getCategoryIcon(category.icon)
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => (mode === 'primary' ? onPickPrimary(category.id) : toggleAdditional(category.id))}
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-[11px] text-left text-[0.84375rem] font-medium text-m-ink ${mode === 'additional' && selected ? 'bg-[color:var(--m-ic)]' : ''}`}
            >
              <CatIcon size={16} strokeWidth={2} className="flex-none" style={{ color: category.color || 'var(--m-muted)' }} />
              <span className="min-w-0 flex-1 truncate">{category.name}</span>
              {mode === 'additional' && (
                <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-md border ${selected ? 'border-m-act bg-m-act text-m-actfg' : 'border-[color:var(--m-rowbr)]'}`} aria-hidden="true">
                  {selected && <Check size={12} strokeWidth={3} />}
                </span>
              )}
            </button>
          )
        })}
        {mode === 'primary' && (
          <button
            type="button"
            onClick={() => onPickPrimary(null)}
            className={`flex w-full items-center gap-3 px-2 py-[11px] text-left text-[0.84375rem] font-medium text-m-muted ${categories.length > 0 ? 'border-t border-[color:var(--m-rowbr)]' : ''}`}
          >
            <MapPin size={16} strokeWidth={2} className="flex-none text-m-faint" />
            <span className="min-w-0 flex-1 truncate">{t('places.noCategory')}</span>
          </button>
        )}
      </div>

      {mode === 'additional' && (
        <div className="flex flex-none justify-between gap-2 border-t border-[color:var(--m-rowbr)] px-[18px] py-3">
          <button type="button" onClick={() => setAdditionalCategoryIds([])} className="rounded-xl px-3 py-2 text-[0.75rem] font-semibold text-m-muted">
            {t('common.clear')}
          </button>
          <button type="button" onClick={() => onPickAdditional(additionalCategoryIds)} className="rounded-xl bg-m-act px-3 py-2 text-[0.75rem] font-semibold text-m-actfg">
            {t('common.save')}
          </button>
        </div>
      )}
    </MSheet>
  )
}
