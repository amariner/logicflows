CREATE TABLE "alarm_acknowledgements" (
	"site_id" text NOT NULL,
	"cell_id" text NOT NULL,
	"code" text NOT NULL,
	"raised_at" timestamp (3) with time zone NOT NULL,
	"acknowledged_at" timestamp (3) with time zone NOT NULL,
	"acknowledged_by" text NOT NULL,
	"acknowledged_by_name" text NOT NULL,
	CONSTRAINT "alarm_acknowledgements_pk" PRIMARY KEY("site_id","cell_id","code","raised_at")
);
--> statement-breakpoint
CREATE INDEX "alarm_acknowledgements_time_idx" ON "alarm_acknowledgements" USING btree ("site_id","cell_id","acknowledged_at");