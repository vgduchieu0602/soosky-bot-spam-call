export default class DailyScheduler {
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _running = false;
    private readonly _formatter: Intl.DateTimeFormat;

    constructor (
        private _timeZone: string,
        private _hour: number,
        private _minute: number,
        private _task: () => Promise<void>,
    ) {
        this._formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: _timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        });
    }

    public start (runOnBoot: boolean): void {
        if (runOnBoot) void this._run();
        this._scheduleNext();
    }

    public stop (): void {
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
    }

    private _scheduleNext (): void {
        const nextRunAt = this._nextRunAt();
        this._timer = setTimeout(() => {
            void this._run().finally(() => this._scheduleNext());
        }, nextRunAt - Date.now());
        console.log(`[scheduler] next FTC sync at ${new Date(nextRunAt).toISOString()} (${this._timeZone}).`);
    }

    private _nextRunAt (): number {
        const start = Math.floor(Date.now() / 60000) * 60000 + 60000;
        for (let minuteOffset = 0; minuteOffset <= 48 * 60; minuteOffset++) {
            const date = new Date(start + minuteOffset * 60000);
            const fields = Object.fromEntries(this._formatter.formatToParts(date).map((part) => [part.type, part.value]));
            if (Number(fields.hour) === this._hour && Number(fields.minute) === this._minute) return date.getTime();
        }
        throw new Error("Could not calculate the next daily FTC sync.");
    }

    private async _run (): Promise<void> {
        if (this._running) {
            console.warn("[scheduler] previous FTC sync is still running; skip overlapping run.");
            return;
        }
        this._running = true;
        try {
            await this._task();
        } catch (error) {
            console.error(`[scheduler] FTC sync failed: ${this._errorMessage(error)}`);
        } finally {
            this._running = false;
        }
    }

    private _errorMessage (error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
