import type { CSSProperties } from 'react';

interface CategoryBadge {
  id: number;
  name?: string | null;
  color?: string | null;
}

interface PlaceCategoryBadgesProps {
  categories?: readonly CategoryBadge[];
  max?: number;
  compact?: boolean;
  style?: CSSProperties;
}

/** Secondary classification badges; never used as the place's marker treatment. */
export default function PlaceCategoryBadges({
  categories = [],
  max = 3,
  compact = false,
  style,
}: PlaceCategoryBadgesProps) {
  if (categories.length === 0) return null;

  const visible = categories.slice(0, max);
  const hidden = categories.slice(max);
  return (
    <span
      className="inline-flex min-w-0 flex-wrap items-center gap-1"
      style={style}
      aria-label={categories
        .map((category) => category.name)
        .filter(Boolean)
        .join(', ')}
    >
      {visible.map((category) => (
        <span
          key={category.id}
          title={category.name ?? undefined}
          className="inline-flex max-w-28 items-center truncate rounded-full font-medium"
          style={{
            padding: compact ? '1px 6px' : '2px 8px',
            fontSize: compact ? 10 : 11,
            lineHeight: compact ? '15px' : '17px',
            color: 'var(--text-secondary)',
            border: `1px solid color-mix(in srgb, ${category.color || 'var(--text-faint)'} 38%, transparent)`,
            background: `color-mix(in srgb, ${category.color || 'var(--text-faint)'} 9%, transparent)`,
          }}
        >
          {category.name}
        </span>
      ))}
      {hidden.length > 0 && (
        <span
          className="text-content-faint"
          title={hidden
            .map((category) => category.name)
            .filter(Boolean)
            .join(', ')}
          style={{ fontSize: compact ? 10 : 11, fontWeight: 600 }}
        >
          +{hidden.length}
        </span>
      )}
    </span>
  );
}
