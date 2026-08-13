import { ComplaintHistory } from "../../entities/DncComplaint";
import ComplaintRepository from "../../repositories/ComplaintRepository";
import E164Phone from "../../value-objects/E164Phone";

export type GetComplaintHistoryQuery = {
    phoneNumber: string;
    from?: Date;
    to?: Date;
};

export default class GetComplaintHistoryUseCase {
    constructor (private _repository: ComplaintRepository) {}

    public async execute (query: GetComplaintHistoryQuery): Promise<ComplaintHistory> {
        return this._repository.findHistory({
            ...query,
            phoneNumber: E164Phone.fromUs(query.phoneNumber).value,
        });
    }
}
