export { ServiceUnhealthyError as default };

class ServiceUnhealthyError extends Error {
    constructor (message: string, public readonly code: string) {
        super(message);
        this.name = "ServiceUnhealthyError";
    }
}
