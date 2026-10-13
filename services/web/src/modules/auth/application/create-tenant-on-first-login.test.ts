import { describe, it, expect, vi } from 'vitest';
import { CreateTenantOnFirstLogin } from './create-tenant-on-first-login';
import type { User } from '../domain/entities';
import type { TenantRepository } from './ports/tenant-repository';
import type { UserRepository } from '../domain/repositories';
import type { Tenant } from '@/modules/billing/domain/entities';

describe('CreateTenantOnFirstLogin', () => {
  it('creates a tenant with free plan on first login', async () => {
    const fakeUser: User = {
      id: 'user-123',
      githubId: 'gh-456',
      login: 'octocat',
      name: 'Octo Cat',
      email: 'octocat@github.com',
      avatarUrl: 'https://github.com/octocat.png',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const createdTenants: Array<{ ownerId: string; plan: string; slug: string }> = [];

    const fakeTenantRepo: TenantRepository = {
      findByOwnerId: vi.fn(async (ownerId: string) => {
        return createdTenants.find((t) => t.ownerId === ownerId) || null;
      }) as TenantRepository['findByOwnerId'],
      findById: vi.fn(),
      create: vi.fn(async (tenant: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>) => {
        const created = {
          id: 'tenant-789',
          ...tenant,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        createdTenants.push({ ownerId: tenant.ownerId, plan: tenant.plan, slug: tenant.slug });
        return created;
      }) as TenantRepository['create'],
      update: vi.fn(),
    };

    const fakeUserRepo: UserRepository = {
      findByGithubId: vi.fn(),
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const useCase = new CreateTenantOnFirstLogin(fakeUserRepo, fakeTenantRepo);

    await useCase.execute(fakeUser);

    expect(fakeTenantRepo.findByOwnerId).toHaveBeenCalledWith('user-123');
    expect(fakeTenantRepo.create).toHaveBeenCalledTimes(1);
    expect(createdTenants).toHaveLength(1);
    expect(createdTenants[0]!).toMatchObject({
      ownerId: 'user-123',
      plan: 'free',
    });
    expect(createdTenants[0]!.slug).toMatch(/^octocat-[a-z0-9]{6}$/);
  });

  it('does not duplicate tenant if user already has one', async () => {
    const fakeUser: User = {
      id: 'user-123',
      githubId: 'gh-456',
      login: 'octocat',
      name: 'Octo Cat',
      email: 'octocat@github.com',
      avatarUrl: 'https://github.com/octocat.png',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existingTenant: Tenant = {
      id: 'tenant-existing',
      name: 'Octo Cat',
      slug: 'octocat-abc123',
      ownerId: 'user-123',
      plan: 'pro',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeCurrentPeriodEnd: null,
      stripeCancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const fakeTenantRepo: TenantRepository = {
      findByOwnerId: vi.fn(async () => existingTenant) as TenantRepository['findByOwnerId'],
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const fakeUserRepo: UserRepository = {
      findByGithubId: vi.fn(),
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const useCase = new CreateTenantOnFirstLogin(fakeUserRepo, fakeTenantRepo);

    await useCase.execute(fakeUser);

    expect(fakeTenantRepo.findByOwnerId).toHaveBeenCalledWith('user-123');
    expect(fakeTenantRepo.create).not.toHaveBeenCalled();
  });

  it('generates valid slug with lowercase, hyphens, and random suffix', async () => {
    const fakeUser: User = {
      id: 'user-123',
      githubId: 'gh-456',
      login: 'My-User.Name',
      name: 'My User',
      email: 'user@example.com',
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const createdTenants: Array<{ slug: string }> = [];

    const fakeTenantRepo: TenantRepository = {
      findByOwnerId: vi.fn(async () => null) as TenantRepository['findByOwnerId'],
      findById: vi.fn(),
      create: vi.fn(async (tenant: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>) => {
        createdTenants.push({ slug: tenant.slug });
        return { id: 'tenant-1', ...tenant, createdAt: new Date(), updatedAt: new Date() };
      }) as TenantRepository['create'],
      update: vi.fn(),
    };

    const fakeUserRepo: UserRepository = {
      findByGithubId: vi.fn(),
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const useCase = new CreateTenantOnFirstLogin(fakeUserRepo, fakeTenantRepo);

    await useCase.execute(fakeUser);

    expect(createdTenants).toHaveLength(1);
    expect(createdTenants[0]!.slug).toMatch(/^my-user-name-[a-z0-9]{6}$/);
  });
});
