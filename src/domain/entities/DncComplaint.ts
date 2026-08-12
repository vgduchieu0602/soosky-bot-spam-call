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
