#!/usr/bin/env node
// Entry point of the `gyde` CLI. The logic lives in run.ts so it can be tested without executing.
import { run } from './run';

process.exitCode = await run(process.argv.slice(2), process.env, {
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
});
