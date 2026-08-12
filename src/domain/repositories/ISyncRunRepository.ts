import { SyncRun, SyncRunStatus } from "../entities/SyncRun";

export type StartSyncRunInput = {
    startedAt: Date;
    createdDateFrom: string;
    createdDateTo: string;
};

export type CompleteSyncRunInput = {
    runId: string;
    status: Exclude<SyncRunStatus, "running">;
    completedAt: Date;
    errorMessage?: string | null;
    fetched?: number;
    accepted?: number;
    inserted?: number;
    updated?: number;
};

export default interface SyncRunRepository {
    startRun (input: StartSyncRunInput): Promise<string>;
    completeRun (input: CompleteSyncRunInput): Promise<void>;
    findLastSuccessfulRun (): Promise<SyncRun | null>;
}
