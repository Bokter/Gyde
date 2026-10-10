import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Dependency } from '@gyde/contracts';
import { XMLParser } from 'fast-xml-parser';

import type { ParsedProject } from '../../types';
import type { DependencyParser } from '../ports';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

/** Reads the `m_EditorVersion` line from ProjectVersion.txt. */
function extractEditorVersion(content: string): string {
  const match = /^m_EditorVersion:\s*(.+)$/m.exec(content);
  if (!match?.[1]) {
    throw new Error('ProjectVersion.txt does not contain a valid m_EditorVersion line');
  }
  return match[1].trim();
}

/** Extracts `<license type="expression">MIT</license>` from a .nuspec XML string. */
function extractNuspecLicense(xml: string): string | undefined {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;
  const metadata = (parsed['package'] as Record<string, unknown> | undefined)?.['metadata'] as
    Record<string, unknown> | undefined;
  const license = metadata?.['license'];
  if (license && typeof license === 'object') {
    const text = (license as Record<string, unknown>)['#text'];
    return typeof text === 'string' ? text.trim() : undefined;
  }
  return typeof license === 'string' ? license.trim() : undefined;
}

/** Scans Assets/Packages subdirectories for .nuspec files and maps package folder names to SPDX licenses. */
async function loadNuspecLicenses(projectRoot: string): Promise<Map<string, string>> {
  const licenses = new Map<string, string>();
  const packagesDir = join(projectRoot, 'Assets', 'Packages');
  let entries;
  try {
    entries = await readdir(packagesDir, { withFileTypes: true });
  } catch {
    return licenses;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    let files;
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    const nuspecFile = files.find((f) => f.endsWith('.nuspec'));
    if (!nuspecFile) continue;
    try {
      const xml = await readFile(join(dir, nuspecFile), 'utf-8');
      const license = extractNuspecLicense(xml);
      if (license) licenses.set(entry.name, license);
    } catch {
      // skip unreadable .nuspec files
    }
  }
  return licenses;
}

interface ManifestDependency {
  [key: string]: string;
}

/**
 * ConcreteProduct (Unity): reads the C# side of a Unity project.
 *
 * Sources to read (all local, nothing leaves the machine):
 * - Packages/manifest.json            -> UPM packages (`ecosystem: "upm"`)
 * - Assets/packages.config            -> NuGet packages (`ecosystem: "nuget"`)
 * - Assets/Packages/&lt;id&gt;/&lt;id&gt;.nuspec -> SPDX license for each NuGet package
 * - ProjectSettings/ProjectVersion.txt -> `gameEngineVersion` (m_EditorVersion)
 */
export class CsharpDependencyParser implements DependencyParser {
  readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async parseDependencies(): Promise<ParsedProject> {
    // 1. Editor version
    const versionPath = join(this.projectRoot, 'ProjectSettings', 'ProjectVersion.txt');
    const versionContent = await readFile(versionPath, 'utf-8');
    const gameEngineVersion = extractEditorVersion(versionContent);

    // 2. UPM packages from manifest.json
    const manifestPath = join(this.projectRoot, 'Packages', 'manifest.json');
    const manifestRaw = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestRaw) as { dependencies?: ManifestDependency };
    const upmDeps: Dependency[] = [];
    for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
      if (name.startsWith('com.unity.modules.')) continue;
      upmDeps.push({ ecosystem: 'upm', name, version, direct: true });
    }

    // 3. NuGet packages from packages.config
    const nugetDeps: Dependency[] = [];
    const packagesConfigPath = join(this.projectRoot, 'Assets', 'packages.config');
    try {
      const packagesConfigXml = await readFile(packagesConfigPath, 'utf-8');
      const parsed = xmlParser.parse(packagesConfigXml) as Record<string, unknown>;
      const packages = (parsed['packages'] as Record<string, unknown> | undefined)?.['package'];
      const packageList = Array.isArray(packages) ? packages : packages ? [packages] : [];
      const nuspecLicenses = await loadNuspecLicenses(this.projectRoot);
      for (const pkg of packageList) {
        const p = pkg as Record<string, unknown>;
        const name = String(p['id'] ?? '');
        const version = String(p['version'] ?? '');
        if (!name || !version) continue;
        const declaredLicense =
          nuspecLicenses.get(`${name}.${version}`) ?? nuspecLicenses.get(name);
        nugetDeps.push({
          ecosystem: 'nuget',
          name,
          version,
          ...(declaredLicense !== undefined ? { declaredLicense } : {}),
          direct: true,
        });
      }
    } catch {
      // packages.config is optional; no NuGet deps found
    }

    // 4. Combine and sort by ecosystem then name (codepoint comparison for determinism)
    const dependencies = [...nugetDeps, ...upmDeps].sort((a, b) => {
      if (a.ecosystem !== b.ecosystem) return a.ecosystem < b.ecosystem ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });

    return {
      project: {
        gameEngine: 'unity',
        gameEngineVersion,
        sdks: [],
        platforms: [],
      },
      dependencies,
    };
  }
}
