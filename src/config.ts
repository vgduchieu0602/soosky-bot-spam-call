import dotenv from "dotenv";

export { config as default };

class MissingEnvVarError extends Error {
    constructor (key: string) {
        super(`Environment variable [${key}] is required.`);
        this.name = "MissingEnvVarError";
    }
}

dotenv.config({ encoding: "utf-8", override: true });

function requiredEnv (key: string): string {
    const value = process.env[key]?.trim();
    if (!value) throw new MissingEnvVarError(key);
    return value;
}

function boundedInt (value: string | undefined, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

const config = {
    mongo: {
        uri: requiredEnv("MONGO_URI"),
        maxPoolSize: boundedInt(process.env.MONGO_MAX_POOL_SIZE, 5, 1),
    },
    ftc: {
        apiKey: requiredEnv("FTC_API_KEY"),
        apiUrl: process.env.FTC_API_URL || "https://api.ftc.gov/v0/dnc-complaints",
        fetchTimeoutMs: boundedInt(process.env.FTC_FETCH_TIMEOUT_MS, 30000, 1),
        retries: boundedInt(process.env.FTC_FETCH_RETRIES, 3, 1),
        requestDelayMs: boundedInt(process.env.FTC_REQUEST_DELAY_MS, 150, 0),
    },
    sync: {
        timeZone: process.env.SYNC_TIME_ZONE || "America/New_York",
        hour: boundedInt(process.env.SYNC_HOUR, 13, 0, 23),
        minute: boundedInt(process.env.SYNC_MINUTE, 0, 0, 59),
        runOnBoot: process.env.SYNC_RUN_ON_BOOT !== "false",
        lookbackDays: boundedInt(process.env.SYNC_LOOKBACK_DAYS, 3, 1),
    },
    health: {
        maxSyncAgeHours: boundedInt(process.env.HEALTH_MAX_SYNC_AGE_HOURS, 48, 1),
    },
    http: {
        port: boundedInt(process.env.HTTP_PORT, 3000, 1, 65535),
        host: process.env.HTTP_HOST || "0.0.0.0",
        corsOrigin: process.env.HTTP_CORS_ORIGIN || "*",
        shutdownTimeoutMs: boundedInt(process.env.HTTP_SHUTDOWN_TIMEOUT_MS, 10000, 0),
        rateLimit: {
            windowMs: boundedInt(process.env.HTTP_RATE_LIMIT_WINDOW_MS, 60000, 1000),
            max: boundedInt(process.env.HTTP_RATE_LIMIT_MAX, 60, 1),
            maxTrackedKeys: boundedInt(process.env.HTTP_RATE_LIMIT_MAX_TRACKED_IPS, 50000, 1),
        },
    },
};
