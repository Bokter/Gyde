export const runtime = 'nodejs';

import { auth } from '@/modules/auth/infrastructure/auth.config';
import { NextResponse } from 'next/server';

// The Stripe webhook authenticates with its signature, not with a session.
const publicPaths = ['/', '/auth/login', '/api/auth', '/api/stripe/webhook', '/healthz'];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isPublicPath = publicPaths.some((path) => nextUrl.pathname.startsWith(path));

  if (isPublicPath) {
    if (isLoggedIn && nextUrl.pathname === '/auth/login') {
      return NextResponse.redirect(new URL('/dashboard', nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const callbackUrl = nextUrl.pathname + nextUrl.search;
    const loginUrl = new URL('/auth/login', nextUrl);
    loginUrl.searchParams.set('callbackUrl', callbackUrl);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
