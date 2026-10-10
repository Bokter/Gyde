CREATE TABLE "ingestion_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ingestion_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"records_processed" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "knowledge_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"source_kind" text NOT NULL,
	"trust" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"severity" text,
	"cvss" double precision,
	"affected" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"game_engines" text[] DEFAULT '{}'::text[] NOT NULL,
	"url" text,
	"published_at" timestamp with time zone,
	"modified_at" timestamp with time zone,
	"ingested_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_packages" (
	"object_id" text NOT NULL,
	"ecosystem" text NOT NULL,
	"name_key" text NOT NULL,
	CONSTRAINT "knowledge_packages_object_id_ecosystem_name_key_pk" PRIMARY KEY("object_id","ecosystem","name_key")
);
--> statement-breakpoint
ALTER TABLE "knowledge_packages" ADD CONSTRAINT "knowledge_packages_object_id_knowledge_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "knowledge_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_runs_source_idx" ON "ingestion_runs" USING btree ("source","finished_at");--> statement-breakpoint
CREATE INDEX "knowledge_objects_source_idx" ON "knowledge_objects" USING btree ("source");--> statement-breakpoint
CREATE INDEX "knowledge_objects_kind_idx" ON "knowledge_objects" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "knowledge_packages_lookup_idx" ON "knowledge_packages" USING btree ("ecosystem","name_key");