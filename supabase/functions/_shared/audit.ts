import { sql, json } from "./db.ts";

export async function audit(actorId: string | null, action: string, objectType: string | null, objectId: string | null, metadata: Record<string, unknown> = {}) {
  try {
    await sql`insert into audit_logs (actor_id, action, object_type, object_id, metadata) values (${actorId}, ${action}, ${objectType}, ${objectId}, ${json(metadata)})`;
  } catch (e) { console.error("audit failed", e); }
}
