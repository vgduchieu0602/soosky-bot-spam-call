import assert from "node:assert/strict";
import test from "node:test";
import ComplaintRepository from "../src/domain/repositories/ComplaintRepository";
import SearchPhoneNumbersUseCase from "../src/domain/use-cases/complaints/SearchPhoneNumbersUseCase";

test("searches a digit fragment and returns matching phone details", async () => {
    let receivedQuery: unknown;
    const repository = {
        searchPhoneNumbers: async (query: unknown) => {
            receivedQuery = query;
            return {
                total: 1,
                items: [{ phoneNumber: "+12025550123", complaintCount: 2, lastComplaintAt: new Date("2026-08-12T00:00:00.000Z") }],
            };
        },
    };

    const result = await new SearchPhoneNumbersUseCase(repository as unknown as ComplaintRepository).execute({ phoneFragment: "0123" });

    assert.deepEqual(receivedQuery, { phoneFragment: "0123" });
    assert.equal(result.items[0]?.phoneNumber, "+12025550123");
});
