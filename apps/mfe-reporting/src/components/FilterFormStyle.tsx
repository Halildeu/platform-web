/**
 * R16 sonrası Adım 14 PR-2 — FilterFormStyle preset.
 *
 * Plan §7 Adım 14 DoD: AG Grid filter component'leri için ortak Tailwind
 * preset (rapor ve dashboard modüllerinde birleşik filter form görünümü).
 *
 * Codex 019e2a83 plan-time önerisi: kozmetik dalga 4-itemli; PR-1
 * useReportFormatter hook MERGED (#521), bu PR-2 preset.
 *
 * Pattern:
 * ```tsx
 * import { FilterFormStyle, FilterFormRow } from '@/components/FilterFormStyle';
 *
 * <FilterFormStyle>
 *   <FilterFormRow label="Tarih Aralığı">
 *     <DateRangePicker ... />
 *   </FilterFormRow>
 *   <FilterFormRow label="Şube">
 *     <BranchSelect ... />
 *   </FilterFormRow>
 * </FilterFormStyle>
 * ```
 */

import React from 'react';

export type FilterFormStyleProps = {
  children: React.ReactNode;
  /** Top-level container element. Default: `div`. */
  as?: keyof JSX.IntrinsicElements;
  /** Additional CSS classes appended after preset classes. */
  className?: string;
  /** Form layout direction. `vertical` (default) stacks rows; `horizontal` lays them out inline (wrap on overflow). */
  direction?: 'vertical' | 'horizontal';
};

/**
 * FilterFormStyle — ortak filter form container.
 *
 * Vertical (default): rows stack
 * Horizontal: rows inline-wrap (responsive grid)
 */
export const FilterFormStyle: React.FC<FilterFormStyleProps> = ({
  children,
  as: Component = 'div',
  className = '',
  direction = 'vertical',
}) => {
  const baseClasses = 'rounded-lg border border-border-subtle bg-surface-muted/30 p-4 shadow-sm';
  const layoutClasses =
    direction === 'horizontal' ? 'flex flex-wrap items-end gap-4' : 'flex flex-col gap-3';

  const ElementTag = Component as React.ElementType;
  return (
    <ElementTag
      className={`${baseClasses} ${layoutClasses} ${className}`.trim()}
      data-testid="filter-form-style"
      data-direction={direction}
    >
      {children}
    </ElementTag>
  );
};

export type FilterFormRowProps = {
  children: React.ReactNode;
  /** Label shown above input(s). */
  label?: string;
  /** Optional helper text shown below input(s). */
  helperText?: string;
  /** Row width (CSS class). Default: `min-w-[200px]`. */
  widthClassName?: string;
};

/**
 * FilterFormRow — label + input wrapper.
 */
export const FilterFormRow: React.FC<FilterFormRowProps> = ({
  children,
  label,
  helperText,
  widthClassName = 'min-w-[200px]',
}) => {
  return (
    <div className={`flex flex-col gap-1 ${widthClassName}`.trim()} data-testid="filter-form-row">
      {label && (
        <label className="text-xs font-medium uppercase tracking-wide text-text-subtle">
          {label}
        </label>
      )}
      {children}
      {helperText && <span className="text-xs text-text-subtle">{helperText}</span>}
    </div>
  );
};
