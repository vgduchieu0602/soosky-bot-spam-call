import { ComplaintReputation } from "../../entities/ComplaintReputation";
import ComplaintRepository from "../../repositories/IComplaintRepository";
import E164Phone from "../../value-objects/E164Phone";

export type GetComplaintReputationQuery = {
    phoneNumber: string;
    from?: Date;
    to?: Date;
};

export { GetComplaintReputationUseCase as default };

class GetComplaintReputationUseCase {
    constructor (private _repository: ComplaintRepository) {}

    public async execute (query: GetComplaintReputationQuery): Promise<ComplaintReputation> {
        return this._repository.findReputation({
            ...query,
            phoneNumber: E164Phone.fromUs(query.phoneNumber).value,
        });
    }
}
