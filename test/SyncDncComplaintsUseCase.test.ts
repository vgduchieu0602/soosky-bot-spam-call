import assert from "node:assert/strict";
import test from "node:test";
import { ComplaintHistory, DncComplaint, DncComplaintCandidate, FindComplaintHistoryQuery, FindSpamNumbersQuery, SearchPhoneNumbersQuery, SpamNumberList, UpsertComplaintsResult } from "../src/domain/entities/DncComplaint";
import { SyncRun } from "../src/domain/entities/SyncRun";
import ComplaintRepository from "../src/domain/repositories/ComplaintRepository";
import ComplaintSource, { FetchDncComplaintsQuery } from "../src/domain/repositories/ComplaintSource";
import SyncRunRepository, { CompleteSyncRunInput, StartSyncRunInput } from "../src/domain/repositories/SyncRunRepository";
import SyncDncComplaintsUseCase from "../src/domain/use-cases/sync/SyncDncComplaintsUseCase";

class FakeSource implements ComplaintSource {
    constructor (private _items: DncComplaintCandidate[]) {}

    public async fetchByCreatedDate (_query: FetchDncComplaintsQuery): Promise<DncComplaintCandidate[]> {
        return this._items;
    }
}

class FailingSource implements ComplaintSource {
    public async fetchByCreatedDate (_query: FetchDncComplaintsQuery): Promise<DncComplaintCandidate[]> {
        throw new Error("FTC API is unavailable.");
    }
}

class FakeRepository implements ComplaintRepository {
    public saved: DncComplaint[] = [];

    public async upsertMany (complaints: DncComplaint[]): Promise<UpsertComplaintsResult> {
        this.saved = complaints;
        return { inserted: complaints.length, updated: 0 };
    }

    public async findHistory (_query: FindComplaintHistoryQuery): Promise<ComplaintHistory> {
        throw new Error("Not used by this test.");
    }

    public async findSpamNumbers (_query: FindSpamNumbersQuery): Promise<SpamNumberList> {
        throw new Error("Not used by this test.");
    }

    public async searchPhoneNumbers (_query: SearchPhoneNumbersQuery): Promise<SpamNumberList> {
        throw new Error("Not used by this test.");
    }
}

class FakeSyncRunRepository implements SyncRunRepository {
    public started: StartSyncRunInput[] = [];
    public completed: CompleteSyncRunInput[] = [];

    public async startRun (input: StartSyncRunInput): Promise<string> {
        this.started.push(input);
        return `run-${this.started.length}`;
    }

    public async completeRun (input: CompleteSyncRunInput): Promise<void> {
        this.completed.push(input);
    }

    public async findLastSuccessfulRun (): Promise<SyncRun | null> {
        throw new Error("Not used by this test.");
    }
}

test("filters invalid data and de-duplicates a FTC complaint id before persistence", async () => {
    const repository = new FakeRepository();
    const syncRuns = new FakeSyncRunRepository();
    const source = new FakeSource([
        { ftcComplaintId: "a", rawPhoneNumber: "202-555-0111", createdAt: "2026-08-10 16:23:11", consumerCity: " Washington ", consumerState: "DC" },
        { ftcComplaintId: "a", rawPhoneNumber: "2025550111", createdAt: "2026-08-10 16:23:11", consumerCity: "Washington", consumerState: "District of Columbia" },
        { ftcComplaintId: "b", rawPhoneNumber: "invalid", createdAt: "2026-08-10 16:23:11", consumerCity: null, consumerState: null },
        { ftcComplaintId: "c", rawPhoneNumber: "2025550111", createdAt: "not-a-date", consumerCity: null, consumerState: null },
    ]);

    const result = await new SyncDncComplaintsUseCase(source, repository, syncRuns).execute({
        createdDateFrom: "2026-08-10",
        createdDateTo: "2026-08-10",
    });

    assert.deepEqual(result, {
        fetched: 4,
        accepted: 1,
        duplicateInSource: 1,
        invalidPhone: 1,
        invalidCreatedAt: 1,
        inserted: 1,
        updated: 0,
    });
    assert.equal(repository.saved[0]?.phoneNumber, "+12025550111");
    assert.equal(repository.saved[0]?.consumerState, "District of Columbia");
});

test("records a running sync run and completes it with the persisted counters", async () => {
    const syncRuns = new FakeSyncRunRepository();
    const source = new FakeSource([
        { ftcComplaintId: "a", rawPhoneNumber: "2025550111", createdAt: "2026-08-10 16:23:11", consumerCity: null, consumerState: null },
    ]);

    await new SyncDncComplaintsUseCase(source, new FakeRepository(), syncRuns).execute({
        createdDateFrom: "2026-08-10",
        createdDateTo: "2026-08-12",
    });

    assert.equal(syncRuns.started.length, 1);
    assert.equal(syncRuns.started[0]?.createdDateFrom, "2026-08-10");
    assert.equal(syncRuns.started[0]?.createdDateTo, "2026-08-12");
    assert.ok(syncRuns.started[0]?.startedAt instanceof Date);
    assert.equal(syncRuns.completed.length, 1);
    assert.equal(syncRuns.completed[0]?.runId, "run-1");
    assert.equal(syncRuns.completed[0]?.status, "success");
    assert.ok(syncRuns.completed[0]?.completedAt instanceof Date);
    assert.deepEqual(
        {
            fetched: syncRuns.completed[0]?.fetched,
            accepted: syncRuns.completed[0]?.accepted,
            inserted: syncRuns.completed[0]?.inserted,
            updated: syncRuns.completed[0]?.updated,
        },
        { fetched: 1, accepted: 1, inserted: 1, updated: 0 },
    );
});

test("marks the sync run failed with the error message and rethrows", async () => {
    const syncRuns = new FakeSyncRunRepository();
    const useCase = new SyncDncComplaintsUseCase(new FailingSource(), new FakeRepository(), syncRuns);

    await assert.rejects(
        useCase.execute({ createdDateFrom: "2026-08-10", createdDateTo: "2026-08-12" }),
        /FTC API is unavailable\./,
    );

    assert.equal(syncRuns.completed.length, 1);
    assert.equal(syncRuns.completed[0]?.status, "failed");
    assert.equal(syncRuns.completed[0]?.errorMessage, "FTC API is unavailable.");
});
