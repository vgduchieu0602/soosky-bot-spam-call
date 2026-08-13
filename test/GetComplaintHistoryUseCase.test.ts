import assert from "node:assert/strict";
import test from "node:test";
import { ComplaintHistory, ComplaintReputation, DncComplaint, FindComplaintHistoryQuery, FindComplaintReputationQuery, FindSpamNumbersQuery, SearchPhoneNumbersQuery, SpamNumberList, UpsertComplaintsResult } from "../src/domain/entities/DncComplaint";
import ComplaintRepository from "../src/domain/repositories/ComplaintRepository";
import GetComplaintHistoryUseCase from "../src/domain/use-cases/complaints/GetComplaintHistoryUseCase";

class FakeRepository implements ComplaintRepository {
    public receivedQuery: FindComplaintHistoryQuery | null = null;

    public async upsertMany (_complaints: DncComplaint[]): Promise<UpsertComplaintsResult> { throw new Error("Not used by this test."); }
    public async findReputation (_query: FindComplaintReputationQuery): Promise<ComplaintReputation> { throw new Error("Not used by this test."); }
    public async findSpamNumbers (_query: FindSpamNumbersQuery): Promise<SpamNumberList> { throw new Error("Not used by this test."); }
    public async searchPhoneNumbers (_query: SearchPhoneNumbersQuery): Promise<SpamNumberList> { throw new Error("Not used by this test."); }

    public async findHistory (query: FindComplaintHistoryQuery): Promise<ComplaintHistory> {
        this.receivedQuery = query;
        return {
            phoneNumber: query.phoneNumber,
            total: 2,
            lastComplaintAt: new Date("2026-08-12T00:00:00.000Z"),
            items: [],
        };
    }
}

test("returns all complaint history for a normalized phone with its latest complaint", async () => {
    const repository = new FakeRepository();
    const result = await new GetComplaintHistoryUseCase(repository).execute({ phoneNumber: "202-555-0111" });

    assert.deepEqual(repository.receivedQuery, { phoneNumber: "+12025550111" });
    assert.equal(result.lastComplaintAt?.toISOString(), "2026-08-12T00:00:00.000Z");
});
