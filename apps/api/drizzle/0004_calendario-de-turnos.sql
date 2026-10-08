CREATE TABLE "shift_calendar_exceptions" (
	"site_id" text NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "shift_calendar_exceptions_site_id_date_pk" PRIMARY KEY("site_id","date")
);
--> statement-breakpoint
CREATE TABLE "shift_calendar_shifts" (
	"site_id" text NOT NULL,
	"effective_from" date NOT NULL,
	"weekday" smallint NOT NULL,
	"start_hour" smallint NOT NULL,
	"end_hour" smallint NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "shift_calendar_shifts_pk" PRIMARY KEY("site_id","effective_from","weekday","start_hour")
);
--> statement-breakpoint
CREATE TABLE "shift_calendar_versions" (
	"site_id" text NOT NULL,
	"effective_from" date NOT NULL,
	"time_zone" text NOT NULL,
	"created_by" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "shift_calendar_versions_site_id_effective_from_pk" PRIMARY KEY("site_id","effective_from")
);
--> statement-breakpoint
ALTER TABLE "shift_calendar_shifts" ADD CONSTRAINT "shift_calendar_shifts_version_fk" FOREIGN KEY ("site_id","effective_from") REFERENCES "public"."shift_calendar_versions"("site_id","effective_from") ON DELETE cascade ON UPDATE no action;