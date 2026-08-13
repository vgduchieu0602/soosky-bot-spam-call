import assert from "node:assert/strict";
import test from "node:test";
import MongoComplaintRepository from "../src/adapters/mongo/MongoComplaintRepository";
import DncComplaintModel from "../src/adapters/mongo/models/DncComplaintModel";

test("upserts by FTC complaint id so a repeated sync cannot create duplicates", async () => {
    const model = DncComplaintModel as unknown as {
        bulkWrite: (operations: unknown[], options: unknown) => Promise<{ upsertedCount: number; modifiedCount: number }>;
    };
    const originalBulkWrite = model.bulkWrite;
    const calls: unknown[][] = [];
    model.bulkWrite = async (operations) => {
        calls.push(operations);
        return { upsertedCount: 1, modifiedCount: 0 };
    };

    try {
        const repository = new MongoComplaintRepository();
        const complaint = {
            ftcComplaintId: "ftc-123",
            phoneNumber: "+12025550111",
            rawPhoneNumber: "202-555-0111",
            createdAt: new Date("2026-08-01T00:00:00.000Z"),
            consumerCity: "Washington",
            consumerState: "DC",
            sourceFetchedAt: new Date("2026-08-02T00:00:00.000Z"),
        };

        await repository.upsertMany([complaint]);
        await repository.upsertMany([complaint]);

        assert.equal(calls.length, 2);
        assert.deepEqual(calls[0], calls[1]);
        assert.deepEqual(calls[0], [{
            updateOne: {
                filter: { ftcComplaintId: "ftc-123" },
                update: {
                    $set: {
                        phoneNumber: "+12025550111",
                        rawPhoneNumber: "202-555-0111",
                        createdAt: new Date("2026-08-01T00:00:00.000Z"),
                        consumerCity: "Washington",
                        consumerState: "DC",
                        sourceFetchedAt: new Date("2026-08-02T00:00:00.000Z"),
                    },
                },
                upsert: true,
            },
        }]);
    } finally {
        model.bulkWrite = originalBulkWrite;
    }
});
