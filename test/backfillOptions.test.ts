import assert from "node:assert/strict";
import test from "node:test";
import { createBackfillRanges, parseBackfillOptions } from "../src/cmd/backfillOptions";

test("defaults to the full FTC API period in weekly ranges", () => {
    const options = parseBackfillOptions([], "2026-08-13");

    assert.deepEqual(options, { from: "2020-04-01", to: "2026-08-13", chunkDays: 7 });
    assert.deepEqual(createBackfillRanges(options).slice(0, 2), [
        { createdDateFrom: "2020-04-01", createdDateTo: "2020-04-07" },
        { createdDateFrom: "2020-04-08", createdDateTo: "2020-04-14" },
    ]);
});

test("accepts a resumable date range and rejects invalid options", () => {
    assert.deepEqual(parseBackfillOptions(["--from", "2026-08-01", "--to", "2026-08-03", "--chunk-days", "2"], "2026-08-13"), {
        from: "2026-08-01",
        to: "2026-08-03",
        chunkDays: 2,
    });
    assert.throws(() => parseBackfillOptions(["--from", "2026-08-04", "--to", "2026-08-03"], "2026-08-13"), /on or before/);
    assert.throws(() => parseBackfillOptions(["--chunk-days", "0"], "2026-08-13"), /chunk-days/);
});
