import { describe, it } from 'vitest';

/**
 * Executable acceptance criteria for the Area 4 work in this package. Turn each `it.todo` into a
 * real test as you implement it. Use the samples of @gyde/contracts and fixtures/ for data.
 */
describe('parsers (use fixtures/projects)', () => {
  it.todo('CsharpDependencyParser reads UPM packages from Packages/manifest.json');
  it.todo('CsharpDependencyParser reads NuGet packages from .csproj / packages.config');
  it.todo('CsharpDependencyParser reads the editor version from ProjectVersion.txt');
  it.todo('CppDependencyParser reads plugins from the .uproject and modules from *.Build.cs');
  it.todo('CppDependencyParser reads vcpkg.json / conanfile.txt when present');
  it.todo('detectGameEngine tells a Unity project from an Unreal one and fails clearly otherwise');
  it.todo('parsers never read or return source code, only names, versions and licenses');
});

describe('pipeline steps still to implement', () => {
  it.todo('analyzeLicenses returns the license findings once the deterministic stage is ready');
  it.todo('generateReport polls until the report is ready, with a timeout');
  it.todo('generateReport raises a clear error when the report ends as failed');
  it.todo('LocalCLIPipeline prints a readable, severity-ordered report and sets the exit code');
  it.todo('GitHubActionPipeline posts the report as a pull request comment');
});

describe('GydeApiClient', () => {
  it.todo('sends the API key as a Bearer token and never logs it');
  it.todo('validates every response with the @gyde/contracts schemas');
  it.todo('goes through the Circuit Breaker and serves the cached report as degraded when open');
  it.todo('maps 401/402/429 to errors the user can act on (invalid key, plan limit, rate limit)');
});
