import type { User } from '../domain/entities';
import type { UserRepository } from '../domain/repositories';
import type { TenantRepository } from './ports/tenant-repository';

export class CreateTenantOnFirstLogin {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly tenantRepository: TenantRepository,
  ) {}

  async execute(user: User): Promise<void> {
    const existingTenant = await this.tenantRepository.findByOwnerId(user.id);
    if (existingTenant) {
      return; // Tenant already exists
    }

    // Create tenant with free plan
    const slug = this.generateSlug(user.login);
    await this.tenantRepository.create({
      name: user.name || user.login,
      slug,
      ownerId: user.id,
      plan: 'free',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeCurrentPeriodEnd: null,
      stripeCancelAtPeriodEnd: false,
    });
  }

  private generateSlug(login: string): string {
    const base = login.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${base}-${randomSuffix}`;
  }
}
