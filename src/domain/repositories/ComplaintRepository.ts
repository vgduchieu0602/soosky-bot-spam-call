import {
    ComplaintHistory,
    ComplaintReputation,
    DncComplaint,
    FindComplaintHistoryQuery,
    FindComplaintReputationQuery,
    FindSpamNumbersQuery,
    SpamNumberList,
    UpsertComplaintsResult,
} from "../entities/DncComplaint";

export default interface ComplaintRepository {
    upsertMany (complaints: DncComplaint[]): Promise<UpsertComplaintsResult>;
    findHistory (query: FindComplaintHistoryQuery): Promise<ComplaintHistory>;
    findReputation (query: FindComplaintReputationQuery): Promise<ComplaintReputation>;
    findSpamNumbers (query: FindSpamNumbersQuery): Promise<SpamNumberList>;
}
