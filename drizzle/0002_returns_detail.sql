ALTER TABLE "returns" ADD COLUMN "refund_ref" text;--> statement-breakpoint
ALTER TABLE "returns" ADD COLUMN "restocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "returns" ADD COLUMN "exchange_order_id" bigint;--> statement-breakpoint
ALTER TABLE "returns" ADD COLUMN "comments" text;