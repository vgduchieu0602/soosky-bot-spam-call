export type BackfillOptions = {
    from: string;
    to: string;
    chunkDays: number;
};

type BackfillRange = {
    createdDateFrom: string;
    createdDateTo: string;
};

const FTC_API_START_DATE = "2020-04-01";
const DEFAULT_CHUNK_DAYS = 7;
const MAX_CHUNK_DAYS = 31;

export function parseBackfillOptions (args: string[], today: string): BackfillOptions {
    let from = FTC_API_START_DATE;
    let to = today;
    let chunkDays = DEFAULT_CHUNK_DAYS;

    for (let index = 0; index < args.length; index++) {
        const option = args[index];
        const value = args[++index];
        if (!value) throw new Error(`Missing value for ${option}.`);
        switch (option) {
            case "--from":
                from = validDate(value, "from");
                break;
            case "--to":
                to = validDate(value, "to");
                break;
            case "--chunk-days":
                chunkDays = Number.parseInt(value, 10);
                if (!Number.isInteger(chunkDays) || chunkDays < 1 || chunkDays > MAX_CHUNK_DAYS) {
                    throw new Error(`chunk-days must be an integer from 1 to ${MAX_CHUNK_DAYS}.`);
                }
                break;
            default:
                throw new Error(`Unknown option: ${option}.`);
        }
    }

    from = validDate(from, "from");
    to = validDate(to, "to");
    if (from > to) throw new Error("from must be on or before to.");
    return { from, to, chunkDays };
}

export function createBackfillRanges (options: BackfillOptions): BackfillRange[] {
    const ranges: BackfillRange[] = [];
    let start = toDate(options.from);
    const end = toDate(options.to);

    while (start <= end) {
        const chunkEnd = new Date(start);
        chunkEnd.setUTCDate(chunkEnd.getUTCDate() + options.chunkDays - 1);
        ranges.push({
            createdDateFrom: toDateString(start),
            createdDateTo: toDateString(chunkEnd > end ? end : chunkEnd),
        });
        start = new Date(chunkEnd);
        start.setUTCDate(start.getUTCDate() + 1);
    }

    return ranges;
}

function validDate (value: string, name: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || toDateString(toDate(value)) !== value) {
        throw new Error(`${name} must be a valid YYYY-MM-DD date.`);
    }
    return value;
}

function toDate (value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
}

function toDateString (value: Date): string {
    return value.toISOString().slice(0, 10);
}
