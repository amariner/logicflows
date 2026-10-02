CREATE TABLE "push_devices" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"registered_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_notified_alarms" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"cell_id" text NOT NULL,
	"code" text NOT NULL,
	"raised_at" timestamp (3) with time zone NOT NULL,
	"notified_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "push_devices_user_idx" ON "push_devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_notified_alarms_activation_uq" ON "push_notified_alarms" USING btree ("site_id","cell_id","code","raised_at");