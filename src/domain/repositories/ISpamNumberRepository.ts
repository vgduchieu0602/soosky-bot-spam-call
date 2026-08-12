import { SpamNumberList } from "../entities/SpamNumberList";

export type FindSpamNumbersQuery = {
    from: Date;
    to?: Date;
    minComplaints: number;
    limit: number;
    offset: number;
};

export default interface SpamNumberRepository {
    findSpamNumbers (query: FindSpamNumbersQuery): Promise<SpamNumberList>;
}
