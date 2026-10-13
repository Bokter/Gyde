import type { User, Account, Session, VerificationToken } from './entities';

export interface UserRepository {
  findByGithubId(githubId: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User>;
}

export interface AccountRepository {
  findByProvider(provider: string, providerAccountId: string): Promise<Account | null>;
  create(account: Omit<Account, 'id'>): Promise<Account>;
  update(id: string, data: Partial<Account>): Promise<Account>;
  delete(userId: string, provider: string): Promise<void>;
}

export interface SessionRepository {
  findByToken(token: string): Promise<Session | null>;
  create(session: Session): Promise<Session>;
  delete(token: string): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
}

export interface VerificationTokenRepository {
  findByToken(token: string): Promise<VerificationToken | null>;
  create(token: VerificationToken): Promise<VerificationToken>;
  delete(identifier: string, token: string): Promise<void>;
}

export const AUTH_REPOSITORY = Symbol('AuthRepository');
export const ACCOUNT_REPOSITORY = Symbol('AccountRepository');
export const SESSION_REPOSITORY = Symbol('SessionRepository');
export const VERIFICATION_TOKEN_REPOSITORY = Symbol('VerificationTokenRepository');
