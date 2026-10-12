import { auth } from '@/modules/auth/infrastructure/auth.config';
import { redirect } from 'next/navigation';
import { LlmConfigManager } from './llm-config-manager';
import styles from './llm-config.module.css';

export default async function LlmConfigPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  return (
    <div className={styles.page}>
      <LlmConfigManager />
    </div>
  );
}
