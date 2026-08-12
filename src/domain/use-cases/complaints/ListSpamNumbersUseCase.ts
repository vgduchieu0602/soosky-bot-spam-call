import { SpamNumberList } from "../../entities/SpamNumberList";
import SpamNumberRepository, { FindSpamNumbersQuery } from "../../repositories/ISpamNumberRepository";

export type ListSpamNumbersQuery = FindSpamNumbersQuery;

export { ListSpamNumbersUseCase as default };

class ListSpamNumbersUseCase {
    constructor (private _repository: SpamNumberRepository) {}

    public async execute (query: ListSpamNumbersQuery): Promise<SpamNumberList> {
        return this._repository.findSpamNumbers(query);
    }
}
