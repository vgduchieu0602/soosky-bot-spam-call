import assert from "node:assert/strict";
import test from "node:test";
import { DatastoreState } from "../../entities/ServiceHealth";
import { SyncRun } from "../../entities/SyncRun";
import ServiceUnhealthyError from "../../errors/ServiceUnhealthyError";
import DatastoreStatus from "../../repositories/IDatastoreStatus";
import SyncRunRepository, { CompleteSyncRunInput, StartSyncRunInput } from "../../repositories/ISyncRunRepository";
import CheckHealthUseCase from "./CheckHealthUseCase";

class FakeDatastoreStatus implements DatastoreStatus {
    constructor (private _state: DatastoreState) {}

    public state (): DatastoreState {
        return this._state;
    }
}

class FakeSyncRunRepository implements SyncRunRepository {
    constructor (private _lastSuccessfulRun: SyncRun | null) {}

    public async startRun (_input: StartSyncRunInput): Promise<string> {
        throw new Error("Not used by this test.");
    }

    public async completeRun (_input: CompleteSyncRunInput): Promise<void> {
        throw new Error("Not used by this test.");
    }

    public async findLastSuccessfulRun (): Promise<SyncRun | null> {
        return this._lastSuccessfulRun;
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

async function unhealthyCode (useCase: CheckHealthUseCase): Promise<string> {
    try {
        await useCase.execute();
    } catch (error) {
        assert.ok(error instanceof ServiceUnhealthyError);
        return error.code;
    }
    throw new Error("Expected the health check to reject.");
}

test("reports healthy with the mongo state and the age of the last successful sync", async () => {
    const completedAt = new Date(Date.now() - 3600 * 1000);
    const useCase = new CheckHealthUseCase(
        new FakeDatastoreStatus("connected"),
        new FakeSyncRunRepository(successfulRunCompletedAt(completedAt)),
        48,
    );

    const health = await useCase.execute();

    assert.deepEqual(health, {
        status: "healthy",
        mongo: "connected",
        lastSuccessfulSyncAt: completedAt,
        syncAgeSeconds: 3600,
    });
});

test("rejects with a state specific code while mongo is not connected", async () => {
    const lastRun = successfulRunCompletedAt(new Date());
    const codeFor = (state: DatastoreState) =>
        unhealthyCode(new CheckHealthUseCase(new FakeDatastoreStatus(state), new FakeSyncRunRepository(lastRun), 48));

    assert.equal(await codeFor("disconnected"), "MONGO_DISCONNECTED");
    assert.equal(await codeFor("connecting"), "MONGO_CONNECTING");
    assert.equal(await codeFor("disconnecting"), "MONGO_DISCONNECTING");
});

test("rejects when no sync has ever completed successfully", async () => {
    const useCase = new CheckHealthUseCase(
        new FakeDatastoreStatus("connected"),
        new FakeSyncRunRepository(null),
        48,
    );

    assert.equal(await unhealthyCode(useCase), "NEVER_SYNCED");
});

test("rejects when the last successful sync is older than the allowed age", async () => {
    const useCase = new CheckHealthUseCase(
        new FakeDatastoreStatus("connected"),
        new FakeSyncRunRepository(successfulRunCompletedAt(new Date(Date.now() - 49 * 3600 * 1000))),
        48,
    );

    assert.equal(await unhealthyCode(useCase), "STALE_DATA");
});
