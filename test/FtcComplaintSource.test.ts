import assert from "node:assert/strict";
import test from "node:test";
import FtcComplaintSource from "../src/adapters/ftc/FtcComplaintSource";

function resource (id: string): object {
    return {
        id,
        attributes: {
            "company-phone-number": "2025550111",
            "created-date": "2026-08-12 12:00:00",
            "consumer-city": "Washington",
            "consumer-state": "DC",
        },
    };
}

test("fetches every FTC page until the source returns a short page", async () => {
    const originalFetch = globalThis.fetch;
    const offsets: string[] = [];
    globalThis.fetch = async (input) => {
        const url = new URL(input.toString());
        const offset = url.searchParams.get("offset") || "0";
        offsets.push(offset);
        const data = offset === "0"
            ? Array.from({ length: 50 }, (_, index) => resource(`first-${index}`))
            : [resource("last")];
        return new Response(JSON.stringify({ data, meta: { "record-total": 51 } }), { status: 200 });
    };

    try {
        const complaints = await new FtcComplaintSource("test-key").fetchByCreatedDate({
            createdDateFrom: "2026-08-12",
            createdDateTo: "2026-08-12",
        });
        assert.equal(complaints.length, 51);
        assert.deepEqual(offsets, ["0", "50"]);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("retries an FTC request after a transient HTTP failure", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls++;
        if (calls === 1) return new Response("rate limited", { status: 429 });
        return new Response(JSON.stringify({ data: [], meta: { "record-total": 0 } }), { status: 200 });
    };

    try {
        const complaints = await new FtcComplaintSource("test-key").fetchByCreatedDate({
            createdDateFrom: "2026-08-12",
            createdDateTo: "2026-08-12",
        });
        assert.deepEqual(complaints, []);
        assert.equal(calls, 2);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
