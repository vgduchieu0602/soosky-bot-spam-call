import { ComplaintHistory } from "../entities/ComplaintHistory";
import { ComplaintReputation } from "../entities/ComplaintReputation";
import { DncComplaint } from "../entities/DncComplaint";

export type UpsertComplaintsResult = {
    inserted: number;
    updated: number;
};

export type FindComplaintHistoryQuery = {
    phoneNumber: string;
    from?: Date;
    to?: Date;
    limit: number;
    offset: number;
};

export type FindComplaintReputationQuery = Omit<FindComplaintHistoryQuery, "limit" | "offset">;

export default interface ComplaintRepository {
    upsertMany (complaints: DncComplaint[]): Promise<UpsertComplaintsResult>;
    findHistory (query: FindComplaintHistoryQuery): Promise<ComplaintHistory>;
    findReputation (query: FindComplaintReputationQuery): Promise<ComplaintReputation>;
}
