import type { HTMLAttributes } from 'react';
import styles from './card.module.css';

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={[styles.card, className].filter(Boolean).join(' ')} {...rest} />;
}
