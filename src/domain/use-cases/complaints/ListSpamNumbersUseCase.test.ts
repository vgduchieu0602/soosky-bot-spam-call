import assert from "node:assert/strict";
import test from "node:test";
import ListSpamNumbersUseCase from "./ListSpamNumbersUseCase";

test("returns a paginated list of reported phone numbers within a date range", async () => {
    const repository = {
        async findSpamNumbers () {
            return {
                total: 2,
                items: [
                    { phoneNumber: "+12025550111", complaintCount: 4, lastComplaintAt: new Date("2026-08-11T15:00:00.000Z") },
                ],
            };
        },
    };
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
