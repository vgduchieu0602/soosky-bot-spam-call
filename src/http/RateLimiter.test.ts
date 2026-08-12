import assert from "node:assert/strict";
import test from "node:test";
import RateLimiter from "./RateLimiter";

const options = { windowMs: 60000, max: 3, maxTrackedKeys: 2 };

test("allows requests up to the limit and rejects the rest of the window", () => {
    const limiter = new RateLimiter(options);

    assert.deepEqual(limiter.consume("ip-1", 1000), { allowed: true, limit: 3, remaining: 2, resetAt: 61000 });
    assert.equal(limiter.consume("ip-1", 2000).remaining, 1);
    assert.equal(limiter.consume("ip-1", 3000).remaining, 0);

    const rejected = limiter.consume("ip-1", 4000);
    assert.equal(rejected.allowed, false);
    assert.equal(rejected.remaining, 0);
    assert.equal(rejected.resetAt, 61000);
});

test("counts each client separately", () => {
    const limiter = new RateLimiter(options);

    limiter.consume("ip-1", 1000);
    limiter.consume("ip-1", 1000);

    assert.equal(limiter.consume("ip-2", 1000).remaining, 2);
});

test("starts a new window once the previous one expires", () => {
    const limiter = new RateLimiter(options);

    for (let attempt = 0; attempt < 4; attempt++) limiter.consume("ip-1", 1000);
    assert.equal(limiter.consume("ip-1", 1000).allowed, false);

    const afterWindow = limiter.consume("ip-1", 61000);
    assert.equal(afterWindow.allowed, true);
    assert.equal(afterWindow.resetAt, 121000);
});

test("drops the oldest client once the tracked key budget is exceeded", () => {
    const limiter = new RateLimiter(options);

    limiter.consume("ip-1", 1000);
    limiter.consume("ip-2", 1000);
    limiter.consume("ip-3", 1000);

    // "ip-1" was evicted, so it is counted as a first request again inside the same window.
    assert.equal(limiter.consume("ip-1", 2000).remaining, 2);
    assert.equal(limiter.consume("ip-3", 2000).remaining, 1);
});
