import { Schema, model } from "mongoose";

export interface DncComplaintDoc {
    ftcComplaintId: string;
    phoneNumber: string;
    rawPhoneNumber: string;
    createdAt: Date;
    consumerCity: string | null;
    consumerState: string | null;
    sourceFetchedAt: Date;
}

const schema = new Schema<DncComplaintDoc>({
    ftcComplaintId: { type: String, required: true, unique: true, index: true },
    phoneNumber: { type: String, required: true, index: true },
    rawPhoneNumber: { type: String, required: true },
    createdAt: { type: Date, required: true, index: true },
    consumerCity: { type: String, default: null },
    consumerState: { type: String, default: null },
    sourceFetchedAt: { type: Date, required: true },
}, {
    collection: "ftc_dnc_complaints",
    versionKey: false,
});

schema.index({ phoneNumber: 1, createdAt: -1 });
schema.index({ consumerState: 1, consumerCity: 1, createdAt: -1 });

export default model<DncComplaintDoc>("DncComplaint", schema);
