import { Schema, model } from "mongoose";
import { SyncRunStatus } from "../../../domain/entities/SyncRun";

export interface SyncRunDoc {
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

const schema = new Schema<SyncRunDoc>({
    status: { type: String, required: true, enum: ["running", "success", "failed"] },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    errorMessage: { type: String, default: null },
    createdDateFrom: { type: String, required: true },
    createdDateTo: { type: String, required: true },
    fetched: { type: Number, default: null },
    accepted: { type: Number, default: null },
    inserted: { type: Number, default: null },
    updated: { type: Number, default: null },
}, {
    collection: "ftc_sync_runs",
    versionKey: false,
});

schema.index({ status: 1, completedAt: -1 });
schema.index({ startedAt: -1 });

export default model<SyncRunDoc>("SyncRun", schema);
