import { FindSpamNumbersQuery, SpamNumberList } from "../../entities/DncComplaint";
import ComplaintRepository from "../../repositories/ComplaintRepository";

export type ListSpamNumbersQuery = FindSpamNumbersQuery;

export { ListSpamNumbersUseCase as default };

class ListSpamNumbersUseCase {
    constructor (private _repository: ComplaintRepository) {}

    public async execute (query: ListSpamNumbersQuery): Promise<SpamNumberList> {
        return this._repository.findSpamNumbers(query);
    }
}
