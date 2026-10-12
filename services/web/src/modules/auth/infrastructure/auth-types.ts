/**
 * The extra columns `users` requires. `githubProfile` puts them on the user Auth.js hands to
 * `adapter.createUser`, and the adapter returns them on the user in the `createUser` event.
 */
declare module 'next-auth' {
  interface User {
    githubId?: string;
    login?: string;
    avatarUrl?: string | null;
  }
}

export {};
