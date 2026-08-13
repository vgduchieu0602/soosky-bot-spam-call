# Initial FTC Backfill

Run the initial import before starting the daily service. Stop `npm run dev` first so the FTC API is not queried by two processes at the same time.

```bash
npm run sync:backfill
```

The command imports every available API date from `2020-04-01` through today in seven-day ranges. Each range uses the normal validation and Mongo upsert flow, so rerunning a completed range does not create duplicate FTC complaint records.

To resume after an interruption, use the day after the last successful range shown in `ftc_sync_runs`:

```bash
npm run sync:backfill -- --from 2024-07-01 --to 2026-08-13
```

Use smaller ranges only when diagnosing a source issue:

```bash
npm run sync:backfill -- --from 2026-08-01 --to 2026-08-07 --chunk-days 1
```

After the backfill completes, start the normal service with `npm run dev` or deploy it. Its scheduler continues to refetch the latest three days and safely updates existing records.
