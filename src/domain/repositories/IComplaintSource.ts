import { DncComplaintCandidate } from "../entities/DncComplaint";

export type FetchDncComplaintsQuery = {
    createdDateFrom: string;
    createdDateTo: string;
};

export default interface ComplaintSource {
    fetchByCreatedDate (query: FetchDncComplaintsQuery): Promise<DncComplaintCandidate[]>;
}
