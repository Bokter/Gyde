'use client';

import { useRef, useState } from 'react';
import { Button } from './button';
import styles from './copy-field.module.css';

export interface CopyFieldProps {
  label: string;
  value: string;
}

/** Shows a secret once (for example a new API key) with a copy button and a live confirmation. */
export function CopyField({ label, value }: CopyFieldProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const valueRef = useRef<HTMLElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch {
      // Clipboard API unavailable (insecure origin or denied): select the text for a manual copy.
      const node = valueRef.current;
      if (node) window.getSelection()?.selectAllChildren(node);
      setStatus('manual');
    }
  }

  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.row}>
        <code ref={valueRef} className={styles.value}>
          {value}
        </code>
        <Button variant="secondary" onClick={copy} className={styles.button}>
          {status === 'copied' ? 'Copiada' : 'Copiar'}
        </Button>
      </div>
      <p className={styles.status} role="status" aria-live="polite">
        {status === 'copied' && 'Copiada al portapapeles.'}
        {status === 'manual' &&
          'No pudimos copiarla automáticamente. Ya está seleccionada: cópiala con Ctrl+C o Cmd+C.'}
      </p>
    </div>
  );
}
