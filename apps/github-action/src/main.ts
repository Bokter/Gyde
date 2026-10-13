// Entry point of the GitHub Action (the `runs.main` of action.yml). The logic lives in run.ts so
// it can be tested without a runner.
import * as core from '@actions/core';

import { run } from './run';

await run(process.env, {
  setSecret: core.setSecret,
  info: core.info,
  warning: core.warning,
  setFailed: core.setFailed,
  setOutput: core.setOutput,
  writeSummary: async (markdown) => {
    // Set by every GitHub runner; missing only when the bundle runs outside one.
    if (!process.env.GITHUB_STEP_SUMMARY) return;
    await core.summary.addRaw(markdown, true).write();
  },
});
