import { Types } from "mongoose";
import { SyncRun } from "../../../domain/entities/SyncRun";
import SyncRunRepository, { CompleteSyncRunInput, StartSyncRunInput } from "../../../domain/repositories/ISyncRunRepository";
import SyncRunModel, { SyncRunDoc } from "../models/SyncRunModel";

export default class MongoSyncRunRepository implements SyncRunRepository {
    public async startRun (input: StartSyncRunInput): Promise<string> {
        const doc = await SyncRunModel.create({
            status: "running",
            startedAt: input.startedAt,
            createdDateFrom: input.createdDateFrom,
            createdDateTo: input.createdDateTo,
        });
        return doc._id.toString();
    }

    public async completeRun (input: CompleteSyncRunInput): Promise<void> {
        await SyncRunModel.updateOne({ _id: new Types.ObjectId(input.runId) }, {
            $set: {
                status: input.status,
                completedAt: input.completedAt,
                errorMessage: input.errorMessage ?? null,
                fetched: input.fetched ?? null,
                accepted: input.accepted ?? null,
                inserted: input.inserted ?? null,
                updated: input.updated ?? null,
            },
        });
    }

    public async findLastSuccessfulRun (): Promise<SyncRun | null> {
        const doc = await SyncRunModel.findOne({ status: "success" })
            .sort({ completedAt: -1 })
            .lean<(SyncRunDoc & { _id: Types.ObjectId }) | null>();
        if (!doc) return null;
        return {
            id: doc._id.toString(),
            status: doc.status,
            startedAt: doc.startedAt,
            completedAt: doc.completedAt,
            errorMessage: doc.errorMessage,
            createdDateFrom: doc.createdDateFrom,
            createdDateTo: doc.createdDateTo,
            fetched: doc.fetched,
            accepted: doc.accepted,
            inserted: doc.inserted,
            updated: doc.updated,
        };
    }
}
