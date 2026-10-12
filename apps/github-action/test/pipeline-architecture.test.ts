import { INVARIANT_STEPS } from '@gyde/analysis-engine';
import { describe, expect, it } from 'vitest';

import { PullRequestCommentPipeline } from '../src/pull-request-comment.pipeline';

describe('architecture rule: the Action fills the hook of the Template Method', () => {
  it('PullRequestCommentPipeline overrides no invariant step of the engine pipeline', () => {
    const overridden = INVARIANT_STEPS.filter((step) =>
      Object.prototype.hasOwnProperty.call(PullRequestCommentPipeline.prototype, step),
    );
    expect(overridden).toEqual([]);
    // What it does define is the hook.
    expect(
      Object.prototype.hasOwnProperty.call(PullRequestCommentPipeline.prototype, 'publishResult'),
    ).toBe(true);
  });
});
