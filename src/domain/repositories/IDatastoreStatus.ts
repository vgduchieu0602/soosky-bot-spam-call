import { DatastoreState } from "../entities/ServiceHealth";

export default interface DatastoreStatus {
    state (): DatastoreState;
}
