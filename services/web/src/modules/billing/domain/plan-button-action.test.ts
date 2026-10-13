import type { Plan } from '@gyde/contracts';
import { describe, expect, it } from 'vitest';
import { planButtonAction, type PlanButtonAction } from './plan-button-action';

const PLANS: Plan[] = ['free', 'pro', 'studio'];

// Rows: who is looking (null = no session). Columns: the Free, Pro and Studio buttons.
const EXPECTED: [Plan | null, PlanButtonAction[]][] = [
  [null, ['login', 'login', 'login']],
  ['free', ['dashboard', 'checkout', 'checkout']],
  ['pro', ['portal', 'dashboard', 'portal']],
  ['studio', ['portal', 'portal', 'dashboard']],
];

describe('planButtonAction', () => {
  it('logs in, opens the dashboard for the current plan, and never checks out a paying studio', () => {
    for (const [current, actions] of EXPECTED) {
      expect(PLANS.map((target) => planButtonAction(current, target))).toEqual(actions);
    }
  });
});
