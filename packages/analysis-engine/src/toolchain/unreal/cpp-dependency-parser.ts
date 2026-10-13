import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { Dependency } from '@gyde/contracts';

import type { ParsedProject } from '../../types';
import type { DependencyParser } from '../ports';

/** Names inside a `Public/PrivateDependencyModuleNames.AddRange(new string[] { ... })` call. */
const MODULE_LIST_RE =
  /(?:Public|Private)DependencyModuleNames\s*\.\s*(?:AddRange|Add)\s*\(([^)]*)\)/g;
const QUOTED_RE = /"([^"]+)"/g;

/**
 * ConcreteProduct (Unreal): reads the C++ side of an Unreal project.
 *
 * Sources to read (all local, nothing leaves the machine):
 * - the root `*.uproject`           -> engine version (EngineAssociation) and enabled plugins
 * - every `.Build.cs` under Source  -> module dependencies (Public/PrivateDependencyModuleNames)
 * - `vcpkg.json`                    -> third-party C++ libraries (`ecosystem: "cpp"`)
 * - `conanfile.txt` ([requires])    -> third-party C++ libraries (`ecosystem: "cpp"`)
 *
 * Only names, versions and licenses ever leave this class: no sources, no paths, no snippets.
 */
export class CppDependencyParser implements DependencyParser {
  readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async parseDependencies(): Promise<ParsedProject> {
    const uproject = await this.readUproject();
    const engineVersion = readEngineAssociation(uproject);
    const ownModules = ownModuleNames(uproject);

    const dependencies: Dependency[] = [
      ...this.parseEnginePlugins(uproject, engineVersion),
      ...(await this.parseBuildModules(ownModules, engineVersion)),
      ...(await this.parseVcpkg()),
      ...(await this.parseConan()),
    ];

    return {
      project: {
        gameEngine: 'unreal',
        gameEngineVersion: engineVersion,
        sdks: [],
        platforms: [],
      },
      dependencies: dedupeAndSort(dependencies),
    };
  }

  /** The root `*.uproject`. Its absence is a hard error: there is nothing else to read. */
  private async readUproject(): Promise<Record<string, unknown>> {
    const entries = await readdir(this.projectRoot);
    const uprojectName = entries.find((name) => name.toLowerCase().endsWith('.uproject'));
    if (!uprojectName) {
      throw new Error(`No *.uproject file found in "${this.projectRoot}"`);
    }

    const raw = await readFile(join(this.projectRoot, uprojectName), 'utf-8');
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`The file "${uprojectName}" is not valid JSON`);
    }
  }

  /** Enabled plugins of the engine, carrying the engine version (plugins ship with it). */
  private parseEnginePlugins(
    uproject: Record<string, unknown>,
    engineVersion: string,
  ): Dependency[] {
    const plugins = Array.isArray(uproject['Plugins']) ? uproject['Plugins'] : [];
    const dependencies: Dependency[] = [];
    for (const entry of plugins) {
      const plugin = entry as Record<string, unknown>;
      if (plugin['Enabled'] !== true) continue;
      const name = typeof plugin['Name'] === 'string' ? plugin['Name'].trim() : '';
      if (!name) continue;
      dependencies.push({ ecosystem: 'unreal', name, version: engineVersion, direct: true });
    }
    return dependencies;
  }

  /** Modules declared by every file ending in `.Build.cs` under Source, minus the game's own. */
  private async parseBuildModules(
    ownModules: Set<string>,
    engineVersion: string,
  ): Promise<Dependency[]> {
    const buildFiles = await collectFiles(join(this.projectRoot, 'Source'), '.Build.cs');

    const dependencies: Dependency[] = [];
    for (const file of buildFiles) {
      // The module declared by the file itself belongs to the game, not to its dependencies.
      ownModules.add(basename(file, '.Build.cs'));

      const content = await readFile(file, 'utf-8');
      for (const match of content.matchAll(MODULE_LIST_RE)) {
        for (const quoted of (match[1] ?? '').matchAll(QUOTED_RE)) {
          const name = quoted[1]?.trim();
          if (!name || ownModules.has(name)) continue;
          dependencies.push({ ecosystem: 'unreal', name, version: engineVersion, direct: true });
        }
      }
    }
    return dependencies;
  }

  /** `vcpkg.json`: `dependencies` holds either `"name"` or `{ "name", "version>=" }`. */
  private async parseVcpkg(): Promise<Dependency[]> {
    const raw = await readOptionalFile(join(this.projectRoot, 'vcpkg.json'));
    if (raw === undefined) return [];

    let manifest: { dependencies?: unknown };
    try {
      manifest = JSON.parse(raw) as { dependencies?: unknown };
    } catch {
      throw new Error('vcpkg.json is not valid JSON');
    }

    const entries = Array.isArray(manifest.dependencies) ? manifest.dependencies : [];
    const dependencies: Dependency[] = [];
    for (const entry of entries) {
      if (typeof entry === 'string') {
        if (entry) {
          dependencies.push({ ecosystem: 'cpp', name: entry, version: 'unknown', direct: true });
        }
        continue;
      }
      if (entry && typeof entry === 'object') {
        const pkg = entry as Record<string, unknown>;
        const name = typeof pkg['name'] === 'string' ? pkg['name'].trim() : '';
        if (!name) continue;
        const version =
          (typeof pkg['version>='] === 'string' && pkg['version>=']) ||
          (typeof pkg['version'] === 'string' && pkg['version']) ||
          'unknown';
        dependencies.push({ ecosystem: 'cpp', name, version, direct: true });
      }
    }
    return dependencies;
  }

  /** `conanfile.txt`: the `[requires]` section holds `name/version` references. */
  private async parseConan(): Promise<Dependency[]> {
    const raw = await readOptionalFile(join(this.projectRoot, 'conanfile.txt'));
    if (raw === undefined) return [];

    const dependencies: Dependency[] = [];
    let inRequires = false;
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inRequires = trimmed.toLowerCase() === '[requires]';
        continue;
      }
      if (!inRequires) continue;

      const reference = trimmed.split('@')[0] ?? '';
      const slash = reference.indexOf('/');
      const name = (slash === -1 ? reference : reference.slice(0, slash)).trim();
      const version = slash === -1 ? 'unknown' : reference.slice(slash + 1).trim() || 'unknown';
      if (!name) continue;
      dependencies.push({ ecosystem: 'cpp', name, version, direct: true });
    }
    return dependencies;
  }
}

/** The engine version that every engine plugin and module reports. */
function readEngineAssociation(uproject: Record<string, unknown>): string {
  const version = uproject['EngineAssociation'];
  if (typeof version !== 'string' || !version.trim()) {
    throw new Error('The .uproject does not declare a usable "EngineAssociation" version');
  }
  return version.trim();
}

/** Module names declared by the project itself: never reported as dependencies. */
function ownModuleNames(uproject: Record<string, unknown>): Set<string> {
  const own = new Set<string>();
  const modules = Array.isArray(uproject['Modules']) ? uproject['Modules'] : [];
  for (const entry of modules) {
    const name = (entry as Record<string, unknown>)['Name'];
    if (typeof name === 'string' && name) own.add(name);
  }
  return own;
}

/** Recursively collects the files of `dir` ending in `suffix`; a missing directory is empty. */
async function collectFiles(dir: string, suffix: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path, suffix)));
    } else if (entry.name.endsWith(suffix)) {
      files.push(path);
    }
  }
  return files;
}

/** Reads an optional file, returning `undefined` when it does not exist. */
async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return undefined;
  }
}

/** One entry per ecosystem + name, ordered by ecosystem and then name (codepoint, as Unity). */
function dedupeAndSort(dependencies: Dependency[]): Dependency[] {
  const seen = new Set<string>();
  const unique = dependencies.filter((dependency) => {
    const key = `${dependency.ecosystem} ${dependency.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => {
    if (a.ecosystem !== b.ecosystem) return a.ecosystem < b.ecosystem ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}
