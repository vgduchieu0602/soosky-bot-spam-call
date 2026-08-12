import { DncComplaint } from "./DncComplaint";

export interface ComplaintHistory {
    phoneNumber: string;
    total: number;
    items: DncComplaint[];
}
