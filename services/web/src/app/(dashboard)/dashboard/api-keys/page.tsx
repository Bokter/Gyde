import { auth } from '@/modules/auth/infrastructure/auth.config';
import { redirect } from 'next/navigation';
import { ApiKeysManager } from './api-keys-manager';
import styles from './api-keys.module.css';

export default async function ApiKeysPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  return (
    <div className={styles.page}>
      <ApiKeysManager />
    </div>
  );
}
