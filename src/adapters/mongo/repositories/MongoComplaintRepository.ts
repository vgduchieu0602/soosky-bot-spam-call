import { AnyBulkWriteOperation } from "mongoose";
import { ComplaintHistory } from "../../../domain/entities/ComplaintHistory";
import { ComplaintReputation } from "../../../domain/entities/ComplaintReputation";
import { DncComplaint } from "../../../domain/entities/DncComplaint";
import { SpamNumber, SpamNumberList } from "../../../domain/entities/SpamNumberList";
import ComplaintRepository, { FindComplaintHistoryQuery, FindComplaintReputationQuery, UpsertComplaintsResult } from "../../../domain/repositories/IComplaintRepository";
import SpamNumberRepository, { FindSpamNumbersQuery } from "../../../domain/repositories/ISpamNumberRepository";
import DncComplaintModel, { DncComplaintDoc } from "../models/DncComplaintModel";

export default class MongoComplaintRepository implements ComplaintRepository, SpamNumberRepository {
    public async upsertMany (complaints: DncComplaint[]): Promise<UpsertComplaintsResult> {
        if (complaints.length === 0) return { inserted: 0, updated: 0 };

        const operations: AnyBulkWriteOperation<DncComplaintDoc>[] = complaints.map((complaint) => ({
            updateOne: {
                filter: { ftcComplaintId: complaint.ftcComplaintId },
                update: {
                    $set: {
                        phoneNumber: complaint.phoneNumber,
                        rawPhoneNumber: complaint.rawPhoneNumber,
                        createdAt: complaint.createdAt,
                        consumerCity: complaint.consumerCity,
                        consumerState: complaint.consumerState,
                        sourceFetchedAt: complaint.sourceFetchedAt,
                    },
                },
                upsert: true,
            },
        }));
        const result = await DncComplaintModel.bulkWrite(operations, { ordered: false });
        return { inserted: result.upsertedCount, updated: result.modifiedCount };
    }

    public async findHistory (query: FindComplaintHistoryQuery): Promise<ComplaintHistory> {
        const filter = this._filterFor(query);
        const [total, docs] = await Promise.all([
            DncComplaintModel.countDocuments(filter),
            DncComplaintModel.find(filter)
                .sort({ createdAt: -1, ftcComplaintId: -1 })
                .skip(query.offset)
                .limit(query.limit)
                .lean(),
        ]);
        return {
            phoneNumber: query.phoneNumber,
            total,
            items: docs.map((doc) => ({
                ftcComplaintId: doc.ftcComplaintId,
                phoneNumber: doc.phoneNumber,
                rawPhoneNumber: doc.rawPhoneNumber,
                createdAt: doc.createdAt,
                consumerCity: doc.consumerCity,
                consumerState: doc.consumerState,
                sourceFetchedAt: doc.sourceFetchedAt,
            })),
        };
    }

    public async findReputation (query: FindComplaintReputationQuery): Promise<ComplaintReputation> {
        const [result] = await DncComplaintModel.aggregate<{
            complaintCount: number;
            lastComplaintAt: Date | null;
        }>([
            { $match: this._filterFor(query) },
            {
                $group: {
                    _id: null,
                    complaintCount: { $sum: 1 },
                    lastComplaintAt: { $max: "$createdAt" },
                },
            },
        ]);
        return {
            phoneNumber: query.phoneNumber,
            complaintCount: result?.complaintCount || 0,
            lastComplaintAt: result?.lastComplaintAt || null,
        };
    }

    public async findSpamNumbers (query: FindSpamNumbersQuery): Promise<SpamNumberList> {
        const [result] = await DncComplaintModel.aggregate<{
            metadata: { total: number }[];
            items: SpamNumber[];
        }>([
            { $match: this._filterFor(query) },
            {
                $group: {
                    _id: "$phoneNumber",
                    complaintCount: { $sum: 1 },
                    lastComplaintAt: { $max: "$createdAt" },
                },
            },
            { $match: { complaintCount: { $gte: query.minComplaints } } },
            { $sort: { complaintCount: -1, lastComplaintAt: -1, _id: 1 } },
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    items: [
                        { $skip: query.offset },
                        { $limit: query.limit },
                        {
                            $project: {
                                _id: 0,
                                phoneNumber: "$_id",
                                complaintCount: 1,
                                lastComplaintAt: 1,
                            },
                        },
                    ],
                },
            },
        ]);
        return {
            total: result?.metadata[0]?.total || 0,
            items: result?.items || [],
        };
    }

    private _filterFor (query: { from?: Date; to?: Date; phoneNumber?: string }): Record<string, unknown> {
        const createdAt: Record<string, Date> = {};
        if (query.from) createdAt.$gte = query.from;
        if (query.to) createdAt.$lte = query.to;
        return {
            ...(query.phoneNumber ? { phoneNumber: query.phoneNumber } : {}),
            ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
        };
    }
}
