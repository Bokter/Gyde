import type { ParsedProject } from '../../types';
import type { DependencyParser } from '../ports';

/**
 * ConcreteProduct (Unity): reads the C# side of a Unity project.
 *
 * Sources to read (all local, nothing leaves the machine):
 * - Packages/manifest.json            -> UPM packages (`ecosystem: "upm"`)
 * - Packages/packages-lock.json       -> resolved UPM versions
 * - *.csproj / Assets/packages.config -> NuGet packages (`ecosystem: "nuget"`)
 * - ProjectSettings/ProjectVersion.txt -> `gameEngineVersion` (m_EditorVersion)
 *
 * TODO(area-4): implement against fixtures/projects/unity-sample.
 */
export class CsharpDependencyParser implements DependencyParser {
  readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async parseDependencies(): Promise<ParsedProject> {
    throw new Error('TODO(area-4): CsharpDependencyParser is not implemented yet');
  }
}
