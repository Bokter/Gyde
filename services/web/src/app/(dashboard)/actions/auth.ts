'use server';

import { signOut } from '@/modules/auth/infrastructure/auth.config';

export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}
