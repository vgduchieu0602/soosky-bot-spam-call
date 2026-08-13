import assert from "node:assert/strict";
import test from "node:test";
import DailyScheduler from "../src/scheduler/DailyScheduler";

test("waits for the running sync before scheduler shutdown completes", async () => {
    let releaseTask: (() => void) | undefined;
    let calls = 0;
    const scheduler = new DailyScheduler("America/New_York", 13, 0, async () => {
        calls++;
        await new Promise<void>((resolve) => { releaseTask = resolve; });
    });

    scheduler.start(true);
    await new Promise((resolve) => setImmediate(resolve));

    const stopped = scheduler.stop();
    let finished = false;
    void stopped.then(() => { finished = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.equal(finished, false);

    releaseTask?.();
    await stopped;
    assert.equal(finished, true);
});
