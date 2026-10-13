#!/usr/bin/env node
// Entry point of the `gyde` CLI.
//
// TODO(area-4): parse the arguments (see README.md), pick the toolchain with
// `detectGameEngine` + `createToolchainFactory`, build a `LocalCLIPipeline` with a `GydeApiClient`
// and run it. The exit code comes from the report (see the table in README.md).

process.stderr.write(
  'gyde: not implemented yet. See docs/tasks/area-4-motor-llm-y-reportes.md for the plan.\n',
);
process.exitCode = 2;
