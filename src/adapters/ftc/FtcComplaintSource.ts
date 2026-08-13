import { DncComplaintCandidate } from "../../domain/entities/DncComplaint";
import ComplaintSource, { FetchDncComplaintsQuery } from "../../domain/repositories/ComplaintSource";

const FTC_API_URL = "https://api.ftc.gov/v0/dnc-complaints";
const FTC_FETCH_TIMEOUT_MS = 30_000;
const FTC_FETCH_RETRIES = 3;
const FTC_REQUEST_DELAY_MS = 150;

type FtcComplaintResource = {
    id?: unknown;
    attributes?: {
        "company-phone-number"?: unknown;
        "created-date"?: unknown;
        "consumer-city"?: unknown;
        "consumer-state"?: unknown;
    };
};

type FtcResponse = {
    data?: FtcComplaintResource[];
    meta?: { "record-total"?: unknown; "records-total"?: unknown };
};

export default class FtcComplaintSource implements ComplaintSource {
    constructor (
        private _apiKey: string,
    ) {}

    public async fetchByCreatedDate (query: FetchDncComplaintsQuery): Promise<DncComplaintCandidate[]> {
        const complaints: DncComplaintCandidate[] = [];
        const pageSize = 50;
        let offset = 0;
        let expectedTotal = Number.POSITIVE_INFINITY;

        while (offset < expectedTotal) {
            const payload = await this._fetchPage(query, offset, pageSize);
            const resources = Array.isArray(payload.data) ? payload.data : [];
            const reportedTotal = Number(payload.meta?.["record-total"] ?? payload.meta?.["records-total"]);
            if (Number.isSafeInteger(reportedTotal) && reportedTotal >= 0) {
                expectedTotal = reportedTotal;
            }

            for (const resource of resources) {
                const candidate = this._toCandidate(resource);
                if (candidate) complaints.push(candidate);
            }
            offset += resources.length;
            if (resources.length < pageSize) break;
            await sleep(FTC_REQUEST_DELAY_MS);
        }
        return complaints;
    }

    private async _fetchPage (
        query: FetchDncComplaintsQuery,
        offset: number,
        pageSize: number,
    ): Promise<FtcResponse> {
        const url = new URL(FTC_API_URL);
        url.searchParams.set("created_date_from", `\"${query.createdDateFrom}\"`);
        url.searchParams.set("created_date_to", `\"${query.createdDateTo}\"`);
        url.searchParams.set("items_per_page", String(pageSize));
        url.searchParams.set("offset", String(offset));

        let lastError: unknown;
        for (let attempt = 1; attempt <= FTC_FETCH_RETRIES; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), FTC_FETCH_TIMEOUT_MS);
            try {
                const response = await fetch(url, {
                    headers: { "X-Api-Key": this._apiKey, Accept: "application/json" },
                    signal: controller.signal,
                });
                if (!response.ok) {
                    throw new Error(`FTC API returned HTTP ${response.status}.`);
                }
                return await response.json() as FtcResponse;
            } catch (err) {
                lastError = err;
                if (attempt < FTC_FETCH_RETRIES) await sleep(Math.min(1000 * 2 ** (attempt - 1), 10000));
            } finally {
                clearTimeout(timeout);
            }
        }
        throw new Error(`FTC API fetch failed after ${FTC_FETCH_RETRIES} attempts: ${this._errorMessage(lastError)}`);
    }

    private _toCandidate (resource: FtcComplaintResource): DncComplaintCandidate | null {
        const id = typeof resource.id === "string" ? resource.id.trim() : "";
        const attributes = resource.attributes;
        const rawPhoneNumber = typeof attributes?.["company-phone-number"] === "string"
            ? attributes["company-phone-number"]
            : "";
        const createdAt = typeof attributes?.["created-date"] === "string" ? attributes["created-date"] : "";
        if (!id) return null;
        return {
            ftcComplaintId: id,
            rawPhoneNumber,
            createdAt,
            consumerCity: this._optionalString(attributes?.["consumer-city"]),
            consumerState: this._optionalString(attributes?.["consumer-state"]),
        };
    }

    private _optionalString (value: unknown): string | null {
        return typeof value === "string" ? value : null;
    }

    private _errorMessage (error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}

function sleep (milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
