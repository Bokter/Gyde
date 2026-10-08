import { z } from 'zod';

import { Ecosystem, GameEngine, Platform } from './common';

/**
 * PRIVACY INVARIANT. This is everything a client is allowed to send to the backend:
 * names, versions and licenses of dependencies plus the technical context of the project.
 * Every object is `strict`, so any extra field (a file path, a source snippet, a repository
 * URL…) is rejected with a 400. Do NOT relax these schemas without a cross-area review.
 */

export const Dependency = z.strictObject({
  ecosystem: Ecosystem,
  name: z.string().min(1).max(200),
  /** Resolved version when known, otherwise the declared range. */
  version: z.string().min(1).max(100),
  /** License as declared by the package (SPDX identifier when available). */
  declaredLicense: z.string().min(1).max(200).optional(),
  /** False for transitive dependencies. */
  direct: z.boolean().default(true),
});
export type Dependency = z.infer<typeof Dependency>;

export const SdkInfo = z.strictObject({
  name: z.string().min(1).max(100),
  version: z.string().min(1).max(50),
});
export type SdkInfo = z.infer<typeof SdkInfo>;

export const ProjectContext = z.strictObject({
  gameEngine: GameEngine,
  /** e.g. "2022.3.20f1" (Unity) or "5.3.2" (Unreal). */
  gameEngineVersion: z.string().min(1).max(50),
  sdks: z.array(SdkInfo).max(50).default([]),
  platforms: z.array(Platform).max(12).default([]),
});
export type ProjectContext = z.infer<typeof ProjectContext>;

export const ClientInfo = z.strictObject({
  kind: z.enum(['cli', 'github-action', 'vscode-extension']),
  version: z.string().min(1).max(30),
});
export type ClientInfo = z.infer<typeof ClientInfo>;

export const AnalysisOptions = z.strictObject({
  /** Ask for the AI enrichment layer (still subject to plan and to the tenant's LLM key). */
  includeAi: z.boolean().default(true),
});
export type AnalysisOptions = z.infer<typeof AnalysisOptions>;

/** Body of POST /v1/analyses. */
export const AnalysisRequest = z.strictObject({
  client: ClientInfo,
  project: ProjectContext,
  dependencies: z.array(Dependency).max(5000),
  options: AnalysisOptions.default({ includeAi: true }),
});
export type AnalysisRequest = z.infer<typeof AnalysisRequest>;
