import { DncComplaint, DncComplaintCandidate, UpsertComplaintsResult } from "../../entities/DncComplaint";
import ComplaintRepository from "../../repositories/ComplaintRepository";
import ComplaintSource, { FetchDncComplaintsQuery } from "../../repositories/ComplaintSource";
import SyncRunRepository from "../../repositories/SyncRunRepository";
import E164Phone, { InvalidE164PhoneError } from "../../value-objects/E164Phone";

export type SyncDncComplaintsInput = FetchDncComplaintsQuery;

export type SyncDncComplaintsResult = UpsertComplaintsResult & {
    fetched: number;
    accepted: number;
    duplicateInSource: number;
    invalidPhone: number;
    invalidCreatedAt: number;
};

export default class SyncDncComplaintsUseCase {
    constructor (
        private _source: ComplaintSource,
        private _repository: ComplaintRepository,
        private _syncRuns: SyncRunRepository,
    ) {}

    public async execute (input: SyncDncComplaintsInput): Promise<SyncDncComplaintsResult> {
        const runId = await this._syncRuns.startRun({
            startedAt: new Date(),
            createdDateFrom: input.createdDateFrom,
            createdDateTo: input.createdDateTo,
        });

        try {
            const result = await this._sync(input);
            await this._syncRuns.completeRun({
                runId,
                status: "success",
                completedAt: new Date(),
                fetched: result.fetched,
                accepted: result.accepted,
                inserted: result.inserted,
                updated: result.updated,
            });
            return result;
        } catch (error) {
            await this._syncRuns.completeRun({
                runId,
                status: "failed",
                completedAt: new Date(),
                errorMessage: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    private async _sync (input: SyncDncComplaintsInput): Promise<SyncDncComplaintsResult> {
        const candidates = await this._source.fetchByCreatedDate(input);
        const sourceFetchedAt = new Date();
        const complaintsById = new Map<string, DncComplaint>();
        let invalidPhone = 0;
        let invalidCreatedAt = 0;

        for (const candidate of candidates) {
            const complaint = this._normalize(candidate, sourceFetchedAt);
            if (complaint === null) {
                try {
                    E164Phone.fromUs(candidate.rawPhoneNumber);
                    invalidCreatedAt++;
                } catch (err) {
                    if (err instanceof InvalidE164PhoneError) invalidPhone++;
                    else throw err;
                }
                continue;
            }
            complaintsById.set(complaint.ftcComplaintId, complaint);
        }

        const complaints = [...complaintsById.values()];
        const result = await this._repository.upsertMany(complaints);
        return {
            fetched: candidates.length,
            accepted: complaints.length,
            duplicateInSource: candidates.length - complaints.length - invalidPhone - invalidCreatedAt,
            invalidPhone,
            invalidCreatedAt,
            ...result,
        };
    }

    private _normalize (candidate: DncComplaintCandidate, sourceFetchedAt: Date): DncComplaint | null {
        let phoneNumber: string;
        try {
            phoneNumber = E164Phone.fromUs(candidate.rawPhoneNumber).value;
        } catch (err) {
            if (err instanceof InvalidE164PhoneError) return null;
            throw err;
        }

        const createdAt = new Date(candidate.createdAt.includes("T")
            ? candidate.createdAt
            : `${candidate.createdAt.replace(" ", "T")}Z`);
        if (Number.isNaN(createdAt.getTime())) return null;

        return {
            ftcComplaintId: candidate.ftcComplaintId,
            phoneNumber,
            rawPhoneNumber: candidate.rawPhoneNumber.trim(),
            createdAt,
            consumerCity: this._normalizeLocation(candidate.consumerCity),
            consumerState: this._normalizeLocation(candidate.consumerState),
            sourceFetchedAt,
        };
    }

    private _normalizeLocation (value: string | null): string | null {
        const normalized = value?.trim().replace(/\s+/g, " ") || "";
        return normalized || null;
    }
}
