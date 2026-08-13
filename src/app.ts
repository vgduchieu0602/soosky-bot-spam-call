import mongoose from "mongoose";
import FtcComplaintSource from "./adapters/ftc/FtcComplaintSource";
import { connectDatabase } from "./adapters/mongo/connectDatabase";
import MongoComplaintRepository from "./adapters/mongo/MongoComplaintRepository";
import MongoSyncRunRepository from "./adapters/mongo/MongoSyncRunRepository";
import config from "./config";
import GetComplaintHistoryUseCase from "./domain/use-cases/complaints/GetComplaintHistoryUseCase";
import GetComplaintReputationUseCase from "./domain/use-cases/complaints/GetComplaintReputationUseCase";
import ListSpamNumbersUseCase from "./domain/use-cases/complaints/ListSpamNumbersUseCase";
import SearchPhoneNumbersUseCase from "./domain/use-cases/complaints/SearchPhoneNumbersUseCase";
import SyncDncComplaintsUseCase from "./domain/use-cases/sync/SyncDncComplaintsUseCase";
import HealthService from "./http/HealthService";
import RateLimiter from "./http/RateLimiter";
import Server from "./http/Server";
import DailyScheduler from "./scheduler/DailyScheduler";

const SYNC_LOOKBACK_DAYS = 3;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const RATE_LIMIT_OPTIONS = { windowMs: 60_000, max: 60, maxTrackedKeys: 50_000 };

const source = new FtcComplaintSource(config.ftcApiKey);
const repository = new MongoComplaintRepository();
const syncRunRepository = new MongoSyncRunRepository();
const syncDncComplaints = new SyncDncComplaintsUseCase(source, repository, syncRunRepository);
const useCases = {
    complaints: {
        getComplaintHistory: new GetComplaintHistoryUseCase(repository),
        getComplaintReputation: new GetComplaintReputationUseCase(repository),
        listSpamNumbers: new ListSpamNumbersUseCase(repository),
        searchPhoneNumbers: new SearchPhoneNumbersUseCase(repository),
    },
    health: {
        check: new HealthService(syncRunRepository, config.health.maxSyncAgeHours),
    },
};
const scheduler = new DailyScheduler(
    config.sync.timeZone,
    config.sync.hour,
    config.sync.minute,
    async () => {
        const createdDateTo = dateInTimeZone(config.sync.timeZone);
        const createdDateFrom = subtractCalendarDays(createdDateTo, SYNC_LOOKBACK_DAYS - 1);
        const startedAt = Date.now();
        const result = await syncDncComplaints.execute({ createdDateFrom, createdDateTo });
        console.log(`[sync] ${createdDateFrom}..${createdDateTo} in ${Date.now() - startedAt}ms; ${JSON.stringify(result)}`);
    },
);

function dateInTimeZone (timeZone: string): string {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    const fields = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
    return `${fields.year}-${fields.month}-${fields.day}`;
}

function subtractCalendarDays (dateString: string, days: number): string {
    const date = new Date(`${dateString}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
}

const rateLimiter = new RateLimiter(RATE_LIMIT_OPTIONS);
const server = new Server(useCases, rateLimiter, {
    corsOrigin: config.http.corsOrigin,
    trustProxy: config.http.trustProxy,
    rateLimitExemptPath: "/health",
});

(async () => {
    await connectDatabase();
    await server.listen(config.http.port, config.http.host);
    scheduler.start(config.sync.runOnBoot);
    console.log(`[app] listening on http://${config.http.host}:${config.http.port}.`);
})().catch((error) => {
    console.error(`[app] startup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[app] received ${signal}; shutting down.`);
        // A stuck request or sync must not keep the process alive forever.
        setTimeout(() => {
            console.error("[app] graceful shutdown timed out; exiting.");
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS + 5000).unref();
        await Promise.all([
            server.close(SHUTDOWN_TIMEOUT_MS),
            scheduler.stop(),
        ]).catch((error) => console.error(`[app] shutdown error: ${error instanceof Error ? error.message : String(error)}`));
        await mongoose.disconnect().catch(() => undefined);
        console.log("[app] shutdown complete.");
        process.exit(0);
    });
}
