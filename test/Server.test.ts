import assert from "node:assert/strict";
import test from "node:test";
import { Request, Response } from "express";
import Server, { ServerUseCases } from "../src/http/Server";
import RateLimiter from "../src/http/RateLimiter";

test("lists every known spam number without requiring a date range", async () => {
    let receivedQuery: unknown;
    const useCases = {
        complaints: {
            getComplaintHistory: {},
            getComplaintReputation: {},
            listSpamNumbers: {
                execute: async (query: unknown) => {
                    receivedQuery = query;
                    return {
                        total: 1,
                        items: [{ phoneNumber: "+12025550111", complaintCount: 3, lastComplaintAt: new Date("2026-08-12T00:00:00.000Z") }],
                    };
                },
            },
        },
        health: { check: {} },
    } as ServerUseCases;
    const server = new Server(useCases, new RateLimiter({ windowMs: 60000, max: 60, maxTrackedKeys: 10 }), {
        corsOrigin: "*",
        trustProxy: 0,
        rateLimitExemptPath: "/health",
    });
    let body: unknown;
    const response = { json: (value: unknown) => { body = value; } } as Response;
    const request = { query: {} } as Request;

    await (server as unknown as { _GET_spamNumbers: (req: Request, res: Response) => Promise<void> })
        ._GET_spamNumbers(request, response);

    assert.deepEqual(receivedQuery, { from: undefined, to: undefined, minComplaints: 1, limit: 50, offset: 0 });
    assert.deepEqual(body, {
        ok: true,
        data: {
            total: 1,
            items: [{ phoneNumber: "+12025550111", complaintCount: 3, lastComplaintAt: "2026-08-12T00:00:00.000Z" }],
        },
    });
});
