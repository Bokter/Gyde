import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import styles from './select.module.css';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
}

/** Native `<select>` (keyboard and screen-reader support for free) with the Input field layout. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, id, className, children, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={selectId} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <select
          ref={ref}
          id={selectId}
          className={styles.select}
          aria-describedby={hintId}
          {...rest}
        >
          {children}
        </select>
        <svg className={styles.chevron} viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth={2} />
        </svg>
      </div>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
});
