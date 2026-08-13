import mongoose from "mongoose";
import FtcComplaintSource from "../adapters/ftc/FtcComplaintSource";
import { connectDatabase } from "../adapters/mongo/connectDatabase";
import MongoComplaintRepository from "../adapters/mongo/MongoComplaintRepository";
import MongoSyncRunRepository from "../adapters/mongo/MongoSyncRunRepository";
import config from "../config";
import SyncDncComplaintsUseCase from "../domain/use-cases/sync/SyncDncComplaintsUseCase";
import { createBackfillRanges, parseBackfillOptions } from "./backfillOptions";

async function run (): Promise<void> {
    const options = parseBackfillOptions(process.argv.slice(2), dateInTimeZone(config.sync.timeZone));
    const ranges = createBackfillRanges(options);
    const source = new FtcComplaintSource(config.ftcApiKey);
    const repository = new MongoComplaintRepository();
    const syncRuns = new MongoSyncRunRepository();
    const sync = new SyncDncComplaintsUseCase(source, repository, syncRuns);
    let fetched = 0;
    let accepted = 0;
    let inserted = 0;
    let updated = 0;

    await connectDatabase();
    try {
        for (const [index, range] of ranges.entries()) {
            console.log(`[backfill] ${index + 1}/${ranges.length}: ${range.createdDateFrom}..${range.createdDateTo}`);
            const result = await sync.execute(range);
            fetched += result.fetched;
            accepted += result.accepted;
            inserted += result.inserted;
            updated += result.updated;
            console.log(`[backfill] ${range.createdDateFrom}..${range.createdDateTo}: ${JSON.stringify(result)}`);
        }
        console.log(`[backfill] completed: ${JSON.stringify({ fetched, accepted, inserted, updated })}`);
    } finally {
        await mongoose.disconnect().catch(() => undefined);
    }
}

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

void run().catch((error) => {
    console.error(`[backfill] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
