import mongoose from "mongoose";
import SyncRunRepository from "../domain/repositories/SyncRunRepository";
import ServiceUnhealthyError from "./ServiceUnhealthyError";

export type DatastoreState = "disconnected" | "connected" | "connecting" | "disconnecting";

export type ServiceHealth = {
    status: "healthy";
    mongo: DatastoreState;
    lastSuccessfulSyncAt: Date;
    syncAgeSeconds: number;
};

const MONGO_STATES: Record<number, DatastoreState> = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
};

const UNHEALTHY_MONGO_CODES: Record<Exclude<DatastoreState, "connected">, string> = {
    connecting: "MONGO_CONNECTING",
    disconnected: "MONGO_DISCONNECTED",
    disconnecting: "MONGO_DISCONNECTING",
};

export { HealthService as default };

class HealthService {
    constructor (private _syncRuns: SyncRunRepository, private _maxSyncAgeHours: number) {}

    public async check (): Promise<ServiceHealth> {
        const mongo = MONGO_STATES[mongoose.connection.readyState] || "disconnected";
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
