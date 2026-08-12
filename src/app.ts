import mongoose from "mongoose";
import FtcComplaintSource from "./adapters/ftc/FtcComplaintSource";
import connectMongo from "./adapters/mongo/connectMongo";
import MongooseDatastoreStatus from "./adapters/mongo/MongooseDatastoreStatus";
import MongoComplaintRepository from "./adapters/mongo/repositories/MongoComplaintRepository";
import MongoSyncRunRepository from "./adapters/mongo/repositories/MongoSyncRunRepository";
import config from "./config";
import GetComplaintHistoryUseCase from "./domain/use-cases/complaints/GetComplaintHistoryUseCase";
import GetComplaintReputationUseCase from "./domain/use-cases/complaints/GetComplaintReputationUseCase";
import ListSpamNumbersUseCase from "./domain/use-cases/complaints/ListSpamNumbersUseCase";
import CheckHealthUseCase from "./domain/use-cases/health/CheckHealthUseCase";
import SyncDncComplaintsUseCase from "./domain/use-cases/sync/SyncDncComplaintsUseCase";
import RateLimiter from "./http/RateLimiter";
import Server from "./http/Server";
import DailyScheduler from "./scheduler/DailyScheduler";

const source = new FtcComplaintSource(
    config.ftc.apiUrl,
    config.ftc.apiKey,
    config.ftc.fetchTimeoutMs,
    config.ftc.retries,
    config.ftc.requestDelayMs,
);
const repository = new MongoComplaintRepository();
const syncRunRepository = new MongoSyncRunRepository();
const datastoreStatus = new MongooseDatastoreStatus();
const syncDncComplaints = new SyncDncComplaintsUseCase(source, repository, syncRunRepository);
const useCases = {
    complaints: {
        getComplaintHistory: new GetComplaintHistoryUseCase(repository),
        getComplaintReputation: new GetComplaintReputationUseCase(repository),
        listSpamNumbers: new ListSpamNumbersUseCase(repository),
    },
    health: {
        checkHealth: new CheckHealthUseCase(datastoreStatus, syncRunRepository, config.health.maxSyncAgeHours),
    },
};
const scheduler = new DailyScheduler(
    config.sync.timeZone,
    config.sync.hour,
    config.sync.minute,
    async () => {
        const createdDateTo = dateInTimeZone(config.sync.timeZone);
        const createdDateFrom = subtractCalendarDays(createdDateTo, config.sync.lookbackDays - 1);
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

const rateLimiter = new RateLimiter(config.http.rateLimit);
const server = new Server(useCases, rateLimiter, {
    corsOrigin: config.http.corsOrigin,
    rateLimitExemptPath: "/health",
});

(async () => {
    await connectMongo();
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
        }, config.http.shutdownTimeoutMs + 5000).unref();
        await Promise.all([
            server.close(config.http.shutdownTimeoutMs),
            scheduler.stop(),
        ]).catch((error) => console.error(`[app] shutdown error: ${error instanceof Error ? error.message : String(error)}`));
        await mongoose.disconnect().catch(() => undefined);
        console.log("[app] shutdown complete.");
        process.exit(0);
    });
}
