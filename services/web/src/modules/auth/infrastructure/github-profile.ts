import type { GitHubProfile } from 'next-auth/providers/github';
import type { User } from 'next-auth';

/**
 * The user Auth.js passes to `adapter.createUser` on a first login. Besides the standard fields
 * it carries `githubId`, `login` and `avatarUrl`, named like the Drizzle columns: `users` has
 * `github_id` and `login` NOT NULL, so without them the insert fails with 23502 and the login
 * ends in `/auth/login?error=Configuration`.
 */
export function githubProfile(profile: GitHubProfile): User {
  return {
    id: String(profile.id),
    name: profile.name ?? profile.login,
    email: profile.email,
    image: profile.avatar_url,
    githubId: String(profile.id),
    login: profile.login,
    avatarUrl: profile.avatar_url,
  };
}
