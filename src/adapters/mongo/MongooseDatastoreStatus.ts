import mongoose from "mongoose";
import { DatastoreState } from "../../domain/entities/ServiceHealth";
import DatastoreStatus from "../../domain/repositories/IDatastoreStatus";

const READY_STATES: Record<number, DatastoreState> = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
};

export default class MongooseDatastoreStatus implements DatastoreStatus {
    public state (): DatastoreState {
        return READY_STATES[mongoose.connection.readyState] || "disconnected";
    }
}
