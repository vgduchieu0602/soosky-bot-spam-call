import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { SyncRun } from "../src/domain/entities/SyncRun";
import ServiceUnhealthyError from "../src/http/ServiceUnhealthyError";
import SyncRunRepository, { CompleteSyncRunInput, StartSyncRunInput } from "../src/domain/repositories/SyncRunRepository";
import HealthService from "../src/domain/use-cases/health/HealthService";

class FakeSyncRunRepository implements SyncRunRepository {
    constructor (private _lastSuccessfulRun: SyncRun | null) {}

    public async findLastSuccessfulRun (): Promise<SyncRun | null> {
        return this._lastSuccessfulRun;
    }

    public async startRun (_input: StartSyncRunInput): Promise<string> {
        throw new Error("Not used by this test.");
    }

    public async completeRun (_input: CompleteSyncRunInput): Promise<void> {
        throw new Error("Not used by this test.");
    }
}

function successfulRunCompletedAt (completedAt: Date): SyncRun {
    return {
        id: "run-1",
        status: "success",
        startedAt: new Date(completedAt.getTime() - 5000),
        completedAt,
        errorMessage: null,
        createdDateFrom: "2026-08-10",
        createdDateTo: "2026-08-12",
        fetched: 10,
        accepted: 9,
        inserted: 7,
        updated: 2,
    };
}

async function unhealthyCode (service: HealthService): Promise<string> {
    try {
        await service.check();
    } catch (error) {
        assert.ok(error instanceof ServiceUnhealthyError);
        return error.code;
    }
    throw new Error("Expected the health check to reject.");
}

let readyState = 1;
Object.defineProperty(mongoose.connection, "readyState", {
    configurable: true,
    get: () => readyState,
});

test("reports healthy with the age of the last successful sync", async () => {
    readyState = 1;
    const completedAt = new Date(Date.now() - 3600 * 1000);
    const service = new HealthService(new FakeSyncRunRepository(successfulRunCompletedAt(completedAt)), 48);

    assert.deepEqual(await service.check(), {
        status: "healthy",
        mongo: "connected",
        lastSuccessfulSyncAt: completedAt,
        syncAgeSeconds: 3600,
    });
});

test("keeps the mongo health codes for unavailable connection states", async () => {
    const service = new HealthService(new FakeSyncRunRepository(successfulRunCompletedAt(new Date())), 48);

    readyState = 0;
    assert.equal(await unhealthyCode(service), "MONGO_DISCONNECTED");
    readyState = 2;
    assert.equal(await unhealthyCode(service), "MONGO_CONNECTING");
    readyState = 3;
    assert.equal(await unhealthyCode(service), "MONGO_DISCONNECTING");
});

test("keeps the NEVER_SYNCED and STALE_DATA health codes", async () => {
    readyState = 1;
    assert.equal(await unhealthyCode(new HealthService(new FakeSyncRunRepository(null), 48)), "NEVER_SYNCED");
    assert.equal(
        await unhealthyCode(new HealthService(new FakeSyncRunRepository(successfulRunCompletedAt(new Date(Date.now() - 49 * 3600 * 1000))), 48)),
        "STALE_DATA",
    );
});
