import { z } from 'zod';

/** Game engine of the analyzed project (not to be confused with the analysis-engine package). */
export const GameEngine = z.enum(['unity', 'unreal']);
export type GameEngine = z.infer<typeof GameEngine>;

/**
 * Package ecosystem of a dependency.
 * - nuget: C# packages (Unity .csproj / NuGetForUnity)
 * - upm: Unity Package Manager packages (Packages/manifest.json)
 * - unreal: Unreal plugins and modules (.uproject, *.Build.cs)
 * - cpp: third-party C/C++ libraries (vcpkg, conan, ThirdParty folder)
 */
export const Ecosystem = z.enum(['nuget', 'upm', 'unreal', 'cpp']);
export type Ecosystem = z.infer<typeof Ecosystem>;

export const Platform = z.enum([
  'windows',
  'linux',
  'macos',
  'android',
  'ios',
  'webgl',
  'playstation',
  'xbox',
  'switch',
]);
export type Platform = z.infer<typeof Platform>;

export const Severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof Severity>;

/** Severities from the most to the least severe. */
export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/** How much a knowledge source can be trusted (drives ingestion cadence and ranking). */
export const Trust = z.enum(['high', 'medium', 'low']);
export type Trust = z.infer<typeof Trust>;

export const Id = z.string().min(1).max(100);
export type Id = z.infer<typeof Id>;

export const IsoDateTime = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTime>;
