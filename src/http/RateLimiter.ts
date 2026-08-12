export type RateLimiterOptions = {
    windowMs: number;
    max: number;
    maxTrackedKeys: number;
};

export type RateLimitResult = {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
};

export { RateLimiter as default };

class RateLimiter {
    private readonly _hits = new Map<string, { count: number; resetAt: number }>();
    private _nextSweepAt = 0;

    constructor (private _options: RateLimiterOptions) {}

    public consume (key: string, now = Date.now()): RateLimitResult {
        this._evictExpired(now);

        const entry = this._hits.get(key);
        if (!entry || entry.resetAt <= now) {
            const resetAt = now + this._options.windowMs;
            this._hits.set(key, { count: 1, resetAt });
            return { allowed: true, limit: this._options.max, remaining: this._options.max - 1, resetAt };
        }

        entry.count++;
        return {
            allowed: entry.count <= this._options.max,
            limit: this._options.max,
            remaining: Math.max(0, this._options.max - entry.count),
            resetAt: entry.resetAt,
        };
    }

    private _evictExpired (now: number): void {
        if (now >= this._nextSweepAt) {
            this._nextSweepAt = now + this._options.windowMs;
            for (const [key, entry] of this._hits) {
                if (entry.resetAt <= now) this._hits.delete(key);
            }
        }
        // Keys are inserted in arrival order, so the oldest tracked client is dropped first.
        for (const key of this._hits.keys()) {
            if (this._hits.size <= this._options.maxTrackedKeys) break;
            this._hits.delete(key);
        }
    }
}
