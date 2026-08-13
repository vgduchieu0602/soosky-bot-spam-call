import assert from "node:assert/strict";
import test from "node:test";
import { ComplaintHistory, ComplaintReputation, DncComplaint, FindComplaintHistoryQuery, FindComplaintReputationQuery, FindSpamNumbersQuery, SpamNumberList, UpsertComplaintsResult } from "../src/domain/entities/DncComplaint";
import ComplaintRepository from "../src/domain/repositories/ComplaintRepository";
import ListSpamNumbersUseCase from "../src/domain/use-cases/complaints/ListSpamNumbersUseCase";

class FakeRepository implements ComplaintRepository {
    public async upsertMany (_complaints: DncComplaint[]): Promise<UpsertComplaintsResult> {
        throw new Error("Not used by this test.");
    }

    public async findHistory (_query: FindComplaintHistoryQuery): Promise<ComplaintHistory> {
        throw new Error("Not used by this test.");
    }

    public async findReputation (_query: FindComplaintReputationQuery): Promise<ComplaintReputation> {
        throw new Error("Not used by this test.");
    }

    public async findSpamNumbers (_query: FindSpamNumbersQuery): Promise<SpamNumberList> {
        return {
            total: 2,
            items: [
                { phoneNumber: "+12025550111", complaintCount: 4, lastComplaintAt: new Date("2026-08-11T15:00:00.000Z") },
            ],
        };
    }
}

test("returns a paginated list of reported phone numbers within a date range", async () => {
    const repository = new FakeRepository();
    const useCase = new ListSpamNumbersUseCase(repository);

    const result = await useCase.execute({
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date("2026-08-11T23:59:59.999Z"),
        minComplaints: 2,
        limit: 50,
        offset: 0,
    });

    assert.deepEqual(result, {
        total: 2,
        items: [
            { phoneNumber: "+12025550111", complaintCount: 4, lastComplaintAt: new Date("2026-08-11T15:00:00.000Z") },
        ],
    });
});
