CREATE TABLE "cell_hourly" (
	"site_id" text NOT NULL,
	"cell_id" text NOT NULL,
	"hour" timestamp (3) with time zone NOT NULL,
	"boxes" integer NOT NULL,
	"pallets" integer NOT NULL,
	"seconds" jsonb NOT NULL,
	"stops" jsonb NOT NULL,
	"alarms" jsonb NOT NULL,
	"computed_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "cell_hourly_site_id_cell_id_hour_pk" PRIMARY KEY("site_id","cell_id","hour")
);
--> statement-breakpoint
CREATE TABLE "cell_hourly_pending" (
	"site_id" text NOT NULL,
	"cell_id" text NOT NULL,
	"hour" timestamp (3) with time zone NOT NULL,
	"marked_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "cell_hourly_pending_site_id_cell_id_hour_pk" PRIMARY KEY("site_id","cell_id","hour")
);
--> statement-breakpoint
-- Las horas que ya tienen datos quedan pendientes: el primer proceso de
-- agregación calcula el histórico existente (ADR-0016).
INSERT INTO "cell_hourly_pending" ("site_id", "cell_id", "hour", "marked_at")
SELECT "site_id", "cell_id", date_trunc('hour', "source_timestamp"), now()
FROM (
	SELECT "site_id", "cell_id", "source_timestamp" FROM "telemetry_samples"
	UNION ALL
	SELECT "site_id", "cell_id", "source_timestamp" FROM "cell_state_changes"
	UNION ALL
	SELECT "site_id", "cell_id", "source_timestamp" FROM "cell_status_events"
) AS "messages"
GROUP BY 1, 2, 3
ON CONFLICT DO NOTHING;
