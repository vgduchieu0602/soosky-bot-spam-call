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
    mongoUri: requiredEnv("MONGO_URI"),
    ftcApiKey: requiredEnv("FTC_API_KEY"),
    sync: {
        timeZone: process.env.SYNC_TIME_ZONE || "America/New_York",
        hour: boundedInt(process.env.SYNC_HOUR, 13, 0, 23),
        minute: boundedInt(process.env.SYNC_MINUTE, 0, 0, 59),
        runOnBoot: process.env.SYNC_RUN_ON_BOOT !== "false",
    },
    health: {
        maxSyncAgeHours: boundedInt(process.env.HEALTH_MAX_SYNC_AGE_HOURS, 48, 1),
    },
    http: {
        port: boundedInt(process.env.HTTP_PORT, 3000, 1, 65535),
        host: process.env.HTTP_HOST || "127.0.0.1",
        corsOrigin: process.env.HTTP_CORS_ORIGIN || "*",
        // Số hop proxy tin cậy khi đọc IP client. 1 khi đứng sau nginx, 0 khi expose thẳng.
        trustProxy: boundedInt(process.env.HTTP_TRUST_PROXY, 1, 0, 10),
    },
};
