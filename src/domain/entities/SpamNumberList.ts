export interface SpamNumber {
    phoneNumber: string;
    complaintCount: number;
    lastComplaintAt: Date;
}

export interface SpamNumberList {
    total: number;
    items: SpamNumber[];
}
