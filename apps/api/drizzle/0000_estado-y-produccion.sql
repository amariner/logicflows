CREATE TYPE "public"."cell_event" AS ENUM('start', 'started', 'starved', 'blocked', 'supplyRestored', 'pause', 'resume', 'stop', 'fault', 'reset', 'emergencyStop');--> statement-breakpoint
CREATE TYPE "public"."cell_state" AS ENUM('STOPPED', 'STARTING', 'RUNNING', 'WAITING', 'PAUSED', 'FAULT', 'EMERGENCY_STOP');--> statement-breakpoint
CREATE TYPE "public"."conveyor_state" AS ENUM('STOPPED', 'RUNNING', 'FAULT');--> statement-breakpoint
CREATE TYPE "public"."robot_state" AS ENUM('IDLE', 'MOVING', 'FAULT');--> statement-breakpoint
CREATE TYPE "public"."waiting_reason" AS ENUM('STARVED', 'BLOCKED');--> statement-breakpoint
CREATE TABLE "cell_state_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"cell_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"schema_version" integer NOT NULL,
	"source_timestamp" timestamp (3) with time zone NOT NULL,
	"received_at" timestamp (3) with time zone NOT NULL,
	"seq" integer NOT NULL,
	"state" "cell_state" NOT NULL,
	"previous_state" "cell_state",
	"event" "cell_event",
	"waiting_reason" "waiting_reason",
	"since" timestamp (3) with time zone NOT NULL,
	"active_alarms" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cell_status_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"cell_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"schema_version" integer NOT NULL,
	"source_timestamp" timestamp (3) with time zone NOT NULL,
	"received_at" timestamp (3) with time zone NOT NULL,
	"online" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetry_samples" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"cell_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"schema_version" integer NOT NULL,
	"source_timestamp" timestamp (3) with time zone NOT NULL,
	"received_at" timestamp (3) with time zone NOT NULL,
	"seq" integer NOT NULL,
	"boxes_total" integer NOT NULL,
	"pallets_total" integer NOT NULL,
	"current_layer" integer NOT NULL,
	"layers_per_pallet" integer NOT NULL,
	"boxes_in_layer" integer NOT NULL,
	"boxes_per_layer" integer NOT NULL,
	"cycle_time_ms" integer,
	"throughput_boxes_per_hour" double precision NOT NULL,
	"robot_state" "robot_state" NOT NULL,
	"conveyor_state" "conveyor_state" NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cell_state_changes_message_uq" ON "cell_state_changes" USING btree ("site_id","cell_id","session_id","seq");--> statement-breakpoint
CREATE INDEX "cell_state_changes_cell_time_idx" ON "cell_state_changes" USING btree ("site_id","cell_id","source_timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "cell_status_events_message_uq" ON "cell_status_events" USING btree ("site_id","cell_id","session_id","online","source_timestamp");--> statement-breakpoint
CREATE INDEX "cell_status_events_cell_time_idx" ON "cell_status_events" USING btree ("site_id","cell_id","source_timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "telemetry_samples_message_uq" ON "telemetry_samples" USING btree ("site_id","cell_id","session_id","seq");--> statement-breakpoint
CREATE INDEX "telemetry_samples_cell_time_idx" ON "telemetry_samples" USING btree ("site_id","cell_id","source_timestamp");