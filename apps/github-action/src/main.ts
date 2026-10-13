// Entry point of the GitHub Action (the `runs.main` of action.yml).
//
// TODO(area-2): read the inputs declared in action.yml (INPUT_API-KEY, INPUT_API-URL, ...), build a
// `GitHubActionPipeline` with a `GydeApiClient`, run it, post the report as a pull request comment
// and fail the step when the report has findings at or above `fail-on`.

process.stderr.write(
  'gyde action: not implemented yet. See docs/tasks/area-2-web-pagos-y-superficies.md.\n',
);
process.exitCode = 1;
