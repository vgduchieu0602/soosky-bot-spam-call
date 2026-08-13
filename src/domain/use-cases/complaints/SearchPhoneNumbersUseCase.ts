import { SearchPhoneNumbersQuery, SpamNumberList } from "../../entities/DncComplaint";
import ComplaintRepository from "../../repositories/ComplaintRepository";

export { SearchPhoneNumbersUseCase as default };

class SearchPhoneNumbersUseCase {
    constructor (private _repository: ComplaintRepository) {}

    public async execute (query: SearchPhoneNumbersQuery): Promise<SpamNumberList> {
        return this._repository.searchPhoneNumbers(query);
    }
}
