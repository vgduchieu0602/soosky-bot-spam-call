export interface DncComplaintCandidate {
    ftcComplaintId: string;
    rawPhoneNumber: string;
    createdAt: string;
    consumerCity: string | null;
    consumerState: string | null;
}

export interface DncComplaint {
    ftcComplaintId: string;
    phoneNumber: string;
    rawPhoneNumber: string;
    createdAt: Date;
    consumerCity: string | null;
    consumerState: string | null;
    sourceFetchedAt: Date;
}

export type ComplaintHistory = {
    phoneNumber: string;
    total: number;
    items: DncComplaint[];
};

export type ComplaintReputation = {
    phoneNumber: string;
    complaintCount: number;
    lastComplaintAt: Date | null;
};

export type SpamNumber = {
    phoneNumber: string;
    complaintCount: number;
    lastComplaintAt: Date;
};

export type SpamNumberList = {
    total: number;
    items: SpamNumber[];
};

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

export type FindSpamNumbersQuery = {
    from: Date;
    to?: Date;
    minComplaints: number;
    limit: number;
    offset: number;
};
