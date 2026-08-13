import express, { NextFunction, Request, RequestHandler, Response } from "express";
import type { Server as HttpServer } from "node:http";
import GetComplaintHistoryUseCase from "../domain/use-cases/complaints/GetComplaintHistoryUseCase";
import ListSpamNumbersUseCase from "../domain/use-cases/complaints/ListSpamNumbersUseCase";
import SearchPhoneNumbersUseCase from "../domain/use-cases/complaints/SearchPhoneNumbersUseCase";
import HealthService from "./HealthService";
import { InvalidE164PhoneError } from "../domain/value-objects/E164Phone";
import ClientError from "./ClientError";
import formatResponseData from "./formatResponseData";
import RateLimiter from "./RateLimiter";
import ServiceUnhealthyError from "./ServiceUnhealthyError";

export type ServerUseCases = {
    complaints: {
        getComplaintHistory: GetComplaintHistoryUseCase;
        listSpamNumbers: ListSpamNumbersUseCase;
        searchPhoneNumbers: SearchPhoneNumbersUseCase;
    };
    health: {
        check: HealthService;
    };
};

type ServerOptions = {
    corsOrigin: string;
    /** Trusted proxy hops used to resolve the client IP the rate limiter keys on. */
    trustProxy: number;
    /** Uptime probes hit this path far more often than clients hit the API, so it is not rate limited. */
    rateLimitExemptPath: string;
};

export { Server as default };

class Server {
    private readonly _server = express();
    private _listener: HttpServer | null = null;
    private readonly _routes: [string, string, ...RequestHandler[]][] = [
        ["GET", "/health", this._GET_health.bind(this)],
        ["GET", "/api/v1/complaints", this._GET_complaints.bind(this)],
        ["GET", "/api/v1/spam-numbers", this._GET_spamNumbers.bind(this)],
        ["GET", "/api/v1/search", this._GET_searchPhoneNumbers.bind(this)],
    ];

    constructor (
        private _useCases: ServerUseCases,
        private _rateLimiter: RateLimiter,
        private _options: ServerOptions,
    ) {
        this._registerRouter();
        this._registerErrorHandler();
    }

    public listen (port: number, host: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const listener = this._server.listen(port, host, () => resolve());
            listener.once("error", reject);
            this._listener = listener;
        });
    }

    /** Stops accepting connections, lets in-flight requests finish, then drops whatever is still open. */
    public close (timeoutMs: number): Promise<void> {
        const listener = this._listener;
        if (!listener) return Promise.resolve();
        this._listener = null;
        return new Promise((resolve) => {
            const forceTimer = setTimeout(() => listener.closeAllConnections(), timeoutMs);
            listener.close(() => {
                clearTimeout(forceTimer);
                resolve();
            });
            listener.closeIdleConnections();
        });
    }

    private _registerRouter (): void {
        this._server.set("trust proxy", this._options.trustProxy);
        this._server.use(express.json({ limit: "64kb" }));
        this._server.use(this._cors.bind(this));
        this._server.use(this._rateLimit.bind(this));
        for (const [method, path, ...handlers] of this._routes) {
            (this._server as any)[method.toLowerCase()](path, ...handlers);
        }
        this._server.use(() => {
            throw new ClientError("Not Found.", 404, "NOT_FOUND");
        });
    }

    private _registerErrorHandler (): void {
        this._server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
            let statusCode = 500;
            let code = "INTERNAL_ERROR";
            let reason = "An unexpected server error occurred.";
            switch (true) {
                case error instanceof ClientError:
                    statusCode = error.statusCode;
                    code = error.code;
                    reason = error.message;
                    break;
                case error instanceof InvalidE164PhoneError:
                    statusCode = 400;
                    code = "INVALID_PHONE_NUMBER";
                    reason = error.message;
                    break;
                case error instanceof ServiceUnhealthyError:
                    statusCode = 503;
                    code = error.code;
                    reason = error.message;
                    break;
                default:
                    console.error(error);
            }
            res.status(statusCode).json({ ok: false, code, reason });
        });
    }

    private _cors (req: Request, res: Response, next: NextFunction): void {
        const requestOrigin = req.headers.origin;
        const allowedOrigins = this._options.corsOrigin.split(",").map((origin) => origin.trim());
        if (requestOrigin && (allowedOrigins.includes("*") || allowedOrigins.includes(requestOrigin))) {
            res.setHeader("Access-Control-Allow-Origin", allowedOrigins.includes("*") ? "*" : requestOrigin);
            res.setHeader("Vary", "Origin");
            res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        }
        if (req.method === "OPTIONS") {
            res.status(204).end();
            return;
        }
        next();
    }

    private _rateLimit (req: Request, res: Response, next: NextFunction): void {
        if (req.path === this._options.rateLimitExemptPath) {
            next();
            return;
        }

        const now = Date.now();
        const result = this._rateLimiter.consume(req.ip || req.socket.remoteAddress || "unknown", now);
        const resetSeconds = Math.max(0, Math.ceil((result.resetAt - now) / 1000));
        res.setHeader("RateLimit-Limit", result.limit);
        res.setHeader("RateLimit-Remaining", result.remaining);
        res.setHeader("RateLimit-Reset", resetSeconds);
        if (!result.allowed) {
            res.setHeader("Retry-After", resetSeconds);
            throw new ClientError(`Too many requests. Retry in ${resetSeconds}s.`, 429, "RATE_LIMITED");
        }
        next();
    }

    private async _GET_health (_req: Request, res: Response): Promise<void> {
        const health = await this._useCases.health.check.check();
        res.json({ ok: true, data: formatResponseData(health) });
    }

    private async _GET_complaints (req: Request, res: Response): Promise<void> {
        const phoneNumber = this._requiredQueryString(req, "phone");
        const from = this._optionalDate(req, "from", false);
        const to = this._optionalDate(req, "to", true);
        if (from && to && from > to) {
            throw new ClientError("Query param 'from' must be on or before 'to'.", 400, "INVALID_DATE_RANGE");
        }
        const history = await this._useCases.complaints.getComplaintHistory.execute({
            phoneNumber,
            from,
            to,
        });
        res.json({ ok: true, data: formatResponseData(history) });
    }

    private async _GET_spamNumbers (req: Request, res: Response): Promise<void> {
        const from = this._optionalDate(req, "from", false);
        const to = this._optionalDate(req, "to", true);
        if (from && to && from > to) {
            throw new ClientError("Query param 'from' must be on or before 'to'.", 400, "INVALID_DATE_RANGE");
        }
        const pagination = this._spamNumbersPagination(req);
        const result = await this._useCases.complaints.listSpamNumbers.execute({
            from,
            to,
            minComplaints: this._positiveInteger(req, "minComplaints", 1, 1000000, false, "INVALID_MIN_COMPLAINTS"),
            limit: pagination.limit,
            offset: pagination.offset,
        });
        res.json({
            ok: true,
            data: formatResponseData({
                page: pagination.page,
                limit: pagination.limit,
                total: result.total,
                totalPages: Math.ceil(result.total / pagination.limit),
                items: result.items,
            }),
        });
    }

    private async _GET_searchPhoneNumbers (req: Request, res: Response): Promise<void> {
        const phoneFragment = this._phoneFragment(req);
        const result = await this._useCases.complaints.searchPhoneNumbers.execute({ phoneFragment });
        res.json({ ok: true, data: formatResponseData(result) });
    }

    private _requiredQueryString (req: Request, key: string): string {
        const value = req.query[key];
        if (typeof value !== "string" || !value.trim()) {
            throw new ClientError(`Query param '${key}' is required.`, 400, "MISSING_QUERY_PARAM");
        }
        return value;
    }

    private _phoneFragment (req: Request): string {
        const rawValue = this._requiredQueryString(req, "phone");
        const digits = rawValue.replace(/\D/g, "");
        if (digits.length < 3 || digits.length > 15) {
            throw new ClientError("Query param 'phone' must contain 3 to 15 digits.", 400, "INVALID_PHONE_SEARCH");
        }
        return digits;
    }

    private _optionalDate (req: Request, key: string, isEndOfDay: boolean): Date | undefined {
        const value = req.query[key];
        if (value === undefined) return undefined;
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new ClientError(`Query param '${key}' must use YYYY-MM-DD.`, 400, "INVALID_DATE");
        }
        const date = new Date(`${value}T${isEndOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
            throw new ClientError(`Query param '${key}' is not a valid calendar date.`, 400, "INVALID_DATE");
        }
        return date;
    }

    private _positiveInteger (
        req: Request,
        key: string,
        fallback: number,
        maximum: number,
        allowZero = false,
        invalidCode = "INVALID_PAGINATION",
    ): number {
        const value = req.query[key];
        if (value === undefined) return fallback;
        if (typeof value !== "string" || !/^\d+$/.test(value)) {
            throw new ClientError(`Query param '${key}' must be an integer.`, 400, invalidCode);
        }
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number > maximum || (!allowZero && number < 1)) {
            throw new ClientError(`Query param '${key}' is outside its allowed range.`, 400, invalidCode);
        }
        return number;
    }

    private _spamNumbersPagination (req: Request): { page: number; limit: number; offset: number } {
        if (req.query.page !== undefined && req.query.offset !== undefined) {
            throw new ClientError("Use either query param 'page' or 'offset', not both.", 400, "INVALID_PAGINATION");
        }
        const limit = this._positiveInteger(req, "limit", 50, 100);
        if (req.query.offset !== undefined) {
            const offset = this._positiveInteger(req, "offset", 0, Number.MAX_SAFE_INTEGER, true);
            return { page: Math.floor(offset / limit) + 1, limit, offset };
        }
        const maximumPage = Math.floor(Number.MAX_SAFE_INTEGER / limit) + 1;
        const page = this._positiveInteger(req, "page", 1, maximumPage);
        return { page, limit, offset: (page - 1) * limit };
    }
}
