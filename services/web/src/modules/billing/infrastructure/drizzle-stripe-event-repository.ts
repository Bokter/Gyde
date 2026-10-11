import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/lib/db/schema';
import type { StripeEvent } from '../domain/entities';
import type { StripeEventRepository } from '../domain/repositories';

const pool = new Pool({
  connectionString: process.env.WEB_DATABASE_URL,
  max: 10,
});

const db = drizzle(pool, { schema });

export class DrizzleStripeEventRepository implements StripeEventRepository {
  async findByStripeEventId(eventId: string): Promise<StripeEvent | null> {
    const result = await db
      .select()
      .from(schema.stripeEvents)
      .where(eq(schema.stripeEvents.stripeEventId, eventId))
      .limit(1);
    return this.mapEvent(result[0]) || null;
  }

  async create(event: Omit<StripeEvent, 'id' | 'receivedAt'>): Promise<StripeEvent> {
    const result = await db
      .insert(schema.stripeEvents)
      .values({
        stripeEventId: event.stripeEventId,
        type: event.type,
        processed: event.processed,
        payload: event.payload,
        processedAt: event.processedAt,
      })
      .returning();
    return this.mapEvent(result[0])!;
  }

  async markProcessed(id: string): Promise<void> {
    await db
      .update(schema.stripeEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(schema.stripeEvents.id, id));
  }

  private mapEvent(row: typeof schema.stripeEvents.$inferSelect | undefined): StripeEvent | null {
    if (!row) return null;
    return {
      id: row.id,
      stripeEventId: row.stripeEventId,
      type: row.type,
      processed: row.processed,
      payload: row.payload,
      receivedAt: row.receivedAt,
      processedAt: row.processedAt,
    };
  }
}
