export type DatastoreState = "connected" | "connecting" | "disconnected" | "disconnecting";

export interface ServiceHealth {
    status: "healthy";
    mongo: DatastoreState;
    lastSuccessfulSyncAt: Date;
    syncAgeSeconds: number;
}
