import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import styles from './table.module.css';

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Accessible name of the table; visually hidden. */
  caption: string;
}

/**
 * Below 640 px every row turns into a stacked card (no horizontal scroll); each `Td` shows its
 * `label` next to the value so the column headers are not lost.
 */
export function Table({ caption, className, children, ...rest }: TableProps) {
  return (
    <table className={[styles.table, className].filter(Boolean).join(' ')} {...rest}>
      <caption className={styles.caption}>{caption}</caption>
      {children}
    </table>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={[styles.th, className].filter(Boolean).join(' ')} {...rest} />;
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  label: string;
  mono?: boolean;
}

export function Td({ label, mono = false, className, ...rest }: TdProps) {
  return (
    <td
      data-label={label}
      className={[styles.td, mono && styles.mono, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
