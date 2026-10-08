import type { ParsedProject } from '../../types';
import type { DependencyParser } from '../ports';

/**
 * ConcreteProduct (Unreal): reads the C++ side of an Unreal project.
 *
 * Sources to read (all local, nothing leaves the machine):
 * - *.uproject                         -> engine version (EngineAssociation) and enabled plugins
 * - Source/**\/*.Build.cs              -> module dependencies (Public/PrivateDependencyModuleNames)
 * - vcpkg.json / conanfile.txt / ThirdParty/ -> third-party C++ libraries (`ecosystem: "cpp"`)
 *
 * TODO(area-4): implement against fixtures/projects/unreal-sample.
 */
export class CppDependencyParser implements DependencyParser {
  readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async parseDependencies(): Promise<ParsedProject> {
    throw new Error('TODO(area-4): CppDependencyParser is not implemented yet');
  }
}
