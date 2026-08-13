import assert from "node:assert/strict";
import test from "node:test";
import { ComplaintHistory, ComplaintReputation, DncComplaint, FindComplaintHistoryQuery, FindComplaintReputationQuery, FindSpamNumbersQuery, SpamNumberList, UpsertComplaintsResult } from "../src/domain/entities/DncComplaint";
import ComplaintRepository from "../src/domain/repositories/ComplaintRepository";
import GetComplaintReputationUseCase from "../src/domain/use-cases/complaints/GetComplaintReputationUseCase";

class FakeRepository implements ComplaintRepository {
    public receivedQuery: FindComplaintReputationQuery | null = null;

    public async upsertMany (_complaints: DncComplaint[]): Promise<UpsertComplaintsResult> {
        throw new Error("Not used by this test.");
    }

    public async findHistory (_query: FindComplaintHistoryQuery): Promise<ComplaintHistory> {
        throw new Error("Not used by this test.");
    }

    public async findReputation (query: FindComplaintReputationQuery): Promise<ComplaintReputation> {
        this.receivedQuery = query;
        return { phoneNumber: query.phoneNumber, complaintCount: 2, lastComplaintAt: new Date("2026-08-10T00:00:00.000Z") };
    }

    public async findSpamNumbers (_query: FindSpamNumbersQuery): Promise<SpamNumberList> {
        throw new Error("Not used by this test.");
    }
}

test("normalizes a US phone number before looking up its complaint reputation", async () => {
    const repository = new FakeRepository();
    const result = await new GetComplaintReputationUseCase(repository).execute({
        phoneNumber: "202-555-0111",
        from: new Date("2026-08-01T00:00:00.000Z"),
    });

    assert.equal(repository.receivedQuery?.phoneNumber, "+12025550111");
    assert.equal(result.complaintCount, 2);
    assert.equal(result.lastComplaintAt?.toISOString(), "2026-08-10T00:00:00.000Z");
});
