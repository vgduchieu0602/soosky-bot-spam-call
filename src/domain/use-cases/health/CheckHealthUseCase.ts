import { DatastoreState, ServiceHealth } from "../../entities/ServiceHealth";
import ServiceUnhealthyError from "../../errors/ServiceUnhealthyError";
import DatastoreStatus from "../../repositories/IDatastoreStatus";
import SyncRunRepository from "../../repositories/ISyncRunRepository";

const UNHEALTHY_MONGO_CODES: Record<Exclude<DatastoreState, "connected">, string> = {
    connecting: "MONGO_CONNECTING",
    disconnected: "MONGO_DISCONNECTED",
    disconnecting: "MONGO_DISCONNECTING",
};

export default class CheckHealthUseCase {
    constructor (
        private _datastore: DatastoreStatus,
        private _syncRuns: SyncRunRepository,
        private _maxSyncAgeHours: number,
    ) {}

    public async execute (): Promise<ServiceHealth> {
        const mongo = this._datastore.state();
        if (mongo !== "connected") {
            throw new ServiceUnhealthyError(`MongoDB is ${mongo}.`, UNHEALTHY_MONGO_CODES[mongo]);
        }

        const lastRun = await this._syncRuns.findLastSuccessfulRun();
        if (!lastRun?.completedAt) {
            throw new ServiceUnhealthyError("No FTC sync has completed successfully yet.", "NEVER_SYNCED");
        }

        const syncAgeSeconds = Math.max(0, Math.floor((Date.now() - lastRun.completedAt.getTime()) / 1000));
        if (syncAgeSeconds > this._maxSyncAgeHours * 3600) {
            throw new ServiceUnhealthyError(
                `The last successful FTC sync is ${syncAgeSeconds}s old and the allowed age is ${this._maxSyncAgeHours}h.`,
                "STALE_DATA",
            );
        }

        return { status: "healthy", mongo, lastSuccessfulSyncAt: lastRun.completedAt, syncAgeSeconds };
    }
}
