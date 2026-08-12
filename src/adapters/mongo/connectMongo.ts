import mongoose from "mongoose";
import config from "../../config";

export default async function connectMongo (): Promise<void> {
    await mongoose.connect(config.mongo.uri, { maxPoolSize: config.mongo.maxPoolSize });
    console.log("MongoDB connected.");
}
