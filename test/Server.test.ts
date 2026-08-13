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
    } as unknown as ServerUseCases;
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
            page: 1,
            limit: 50,
            total: 1,
            totalPages: 1,
            items: [{ phoneNumber: "+12025550111", complaintCount: 3, lastComplaintAt: "2026-08-12T00:00:00.000Z" }],
        },
    });
});

test("lists spam numbers by page and returns pagination metadata", async () => {
    let receivedQuery: unknown;
    const useCases = {
        complaints: {
            getComplaintHistory: {},
            listSpamNumbers: {
                execute: async (query: unknown) => {
                    receivedQuery = query;
                    return {
                        total: 101,
                        items: [{ phoneNumber: "+12025550111", complaintCount: 3, lastComplaintAt: new Date("2026-08-12T00:00:00.000Z") }],
                    };
                },
            },
            searchPhoneNumbers: {},
        },
        health: { check: {} },
    } as unknown as ServerUseCases;
    const server = new Server(useCases, new RateLimiter({ windowMs: 60000, max: 60, maxTrackedKeys: 10 }), {
        corsOrigin: "*",
        trustProxy: 0,
        rateLimitExemptPath: "/health",
    });
    let body: unknown;
    const response = { json: (value: unknown) => { body = value; } } as Response;

    await (server as unknown as { _GET_spamNumbers: (req: Request, res: Response) => Promise<void> })
        ._GET_spamNumbers({ query: { page: "3", limit: "50" } } as unknown as Request, response);

    assert.deepEqual(receivedQuery, { from: undefined, to: undefined, minComplaints: 1, limit: 50, offset: 100 });
    assert.deepEqual(body, {
        ok: true,
        data: {
            page: 3,
            limit: 50,
            total: 101,
            totalPages: 3,
            items: [{ phoneNumber: "+12025550111", complaintCount: 3, lastComplaintAt: "2026-08-12T00:00:00.000Z" }],
        },
    });
});

test("gets complete phone history without pagination input", async () => {
    let receivedQuery: unknown;
    const useCases = {
        complaints: {
            getComplaintHistory: {
                execute: async (query: unknown) => {
                    receivedQuery = query;
                    return {
                        phoneNumber: "+12025550111",
                        complaintCount: 1,
                        lastComplaintAt: new Date("2026-08-12T00:00:00.000Z"),
                        items: [{
                            ftcComplaintId: "complaint-1",
                            phoneNumber: "+12025550111",
                            rawPhoneNumber: "202-555-0111",
                            reportedAt: new Date("2026-08-12T00:00:00.000Z"),
                            createdAt: new Date("2026-08-12T00:00:00.000Z"),
                            sourceFetchedAt: new Date("2026-08-13T00:00:00.000Z"),
                            consumerCity: null,
                            consumerState: null,
                        }],
                    };
                },
            },
            listSpamNumbers: {},
        },
        health: { check: {} },
    } as unknown as ServerUseCases;
    const server = new Server(useCases, new RateLimiter({ windowMs: 60000, max: 60, maxTrackedKeys: 10 }), { corsOrigin: "*", trustProxy: 0, rateLimitExemptPath: "/health" });
    let body: unknown;
    const response = { json: (value: unknown) => { body = value; } } as unknown as Response;

    await (server as unknown as { _GET_complaints: (req: Request, res: Response) => Promise<void> })
        ._GET_complaints({ query: { phone: "2025550111" } } as unknown as Request, response);

    assert.deepEqual(receivedQuery, { phoneNumber: "2025550111", from: undefined, to: undefined });
    assert.deepEqual(body, {
        ok: true,
        data: {
            phoneNumber: "+12025550111",
            complaintCount: 1,
            lastComplaintAt: "2026-08-12T00:00:00.000Z",
            items: [{
                ftcComplaintId: "complaint-1",
                phoneNumber: "+12025550111",
                rawPhoneNumber: "202-555-0111",
                createdAt: "2026-08-12T00:00:00.000Z",
                reportedAt: "2026-08-12T00:00:00.000Z",
                sourceFetchedAt: "2026-08-13T00:00:00.000Z",
                consumerCity: null,
                consumerState: null,
            }],
        },
    });
});

test("searches phone numbers by a digit fragment", async () => {
    let receivedQuery: unknown;
    const useCases = {
        complaints: {
            getComplaintHistory: {},
            listSpamNumbers: {},
            searchPhoneNumbers: {
                execute: async (query: unknown) => {
                    receivedQuery = query;
                    return { total: 0, items: [] };
                },
            },
        },
        health: { check: {} },
    } as unknown as ServerUseCases;
    const server = new Server(useCases, new RateLimiter({ windowMs: 60000, max: 60, maxTrackedKeys: 10 }), { corsOrigin: "*", trustProxy: 0, rateLimitExemptPath: "/health" });
    const response = { json: () => undefined } as unknown as Response;

    await (server as unknown as { _GET_searchPhoneNumbers: (req: Request, res: Response) => Promise<void> })
        ._GET_searchPhoneNumbers({ query: { phone: "01234" } } as unknown as Request, response);

    assert.deepEqual(receivedQuery, { phoneFragment: "01234" });
});
