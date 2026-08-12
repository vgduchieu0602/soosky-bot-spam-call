export type SyncRunStatus = "running" | "success" | "failed";

export interface SyncRun {
    id: string;
    status: SyncRunStatus;
    startedAt: Date;
    completedAt: Date | null;
    errorMessage: string | null;
    createdDateFrom: string;
    createdDateTo: string;
    fetched: number | null;
    accepted: number | null;
    inserted: number | null;
    updated: number | null;
}
