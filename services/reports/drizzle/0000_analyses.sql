CREATE TABLE "analyses" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"ai_expected" boolean NOT NULL,
	"entitlements" jsonb NOT NULL,
	"deterministic" jsonb,
	"ai" jsonb,
	"failure" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
