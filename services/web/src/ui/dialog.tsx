'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './dialog.module.css';

export interface DialogProps {
  open: boolean;
  /** Called on Esc, on the close button and whenever the dialog closes itself. */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Action buttons, rendered at the end of the dialog. */
  actions?: ReactNode;
}

/**
 * Modal built on the native `<dialog>`: `showModal()` makes the rest of the page inert (focus is
 * trapped), Esc closes it and focus returns to the element that opened it.
 */
export function Dialog({ open, onClose, title, description, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={() => {
        opener.current?.focus();
        if (open) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {description && (
        <div id={descriptionId} className={styles.description}>
          {description}
        </div>
      )}
      {children && <div className={styles.body}>{children}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </dialog>
  );
}
