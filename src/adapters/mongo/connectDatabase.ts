import mongoose from "mongoose";
import config from "../../config";

export async function connectDatabase (): Promise<void> {
    await mongoose.connect(config.mongoUri);
    console.log("[db] MongoDB connected.");
}
