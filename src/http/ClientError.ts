export { ClientError as default };

class ClientError extends Error {
    constructor (
        message: string,
        public readonly statusCode = 400,
        public readonly code = "BAD_REQUEST",
    ) {
        super(message);
        this.name = "ClientError";
    }
}
