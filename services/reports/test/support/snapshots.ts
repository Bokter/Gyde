import type { ReportRepository } from '../../src/application/ports/report-repository';
import { Analysis } from '../../src/domain/entities/analysis.entity';
import type { AnalysisSnapshot, AnalysisStatus } from '../../src/domain/entities/analysis-types';

/**
 * A view of a repository that speaks plain snapshots, so a test can write and read the state of an
 * analysis as data while the adapter under test stores and returns the `Analysis` entity.
 */
export function viaSnapshots(repository: ReportRepository) {
  return {
    create: (snapshot: AnalysisSnapshot) => repository.create(Analysis.rehydrate(snapshot)),
    get: async (id: string): Promise<AnalysisSnapshot | undefined> =>
      (await repository.get(id))?.snapshot(),
    update: (snapshot: AnalysisSnapshot) => repository.update(Analysis.rehydrate(snapshot)),
    findStale: async (status: AnalysisStatus, cutoff: Date): Promise<AnalysisSnapshot[]> =>
      (await repository.findStale(status, cutoff)).map((analysis) => analysis.snapshot()),
  };
}
