import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleAccounts, googleEvents } from "@/db/schema";
import { getUser, sameOrigin } from "@/lib/auth";
import { GoogleError, deleteEvent, updateEvent } from "@/lib/google";
import { accessTokenFor, loadAccount } from "@/lib/calendar-sync";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

async function resolve(userId: string, id: string) {
  const [row] = await db.select().from(googleEvents).where(and(eq(googleEvents.userId, userId), eq(googleEvents.id, id))).limit(1);
  return row ?? null;
}

/** Updates a linked Google event from Folio. Requires event write access. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "Request not allowed." }, { status: 403 });
  const user = await getUser();
  const account = await loadAccount(user.id);
  if (!account) return Response.json({ error: "Google Calendar isn’t connected." }, { status: 400 });
  if (!account.writeEnabled) return Response.json({ error: "Folio doesn’t have permission to edit events.", upgradeRequired: true }, { status: 403 });
  const { id } = await context.params;
  const row = await resolve(user.id, id);
  if (!row) return Response.json({ error: "That event isn’t in your workspace." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Please send valid JSON." }, { status: 400 });
  const title = typeof body.title === "string" ? body.title.trim() : row.title;
  if (!title || title.length > 300) return Response.json({ error: "Give the event a title (1–300 characters)." }, { status: 400 });
  const description = typeof body.description === "string" ? body.description.slice(0, 8000) : row.description;
  const location = typeof body.location === "string" ? body.location.slice(0, 500) : row.location;
  const allDay = body.allDay === undefined ? row.allDay : body.allDay === true;
  const fallbackStart = row.allDay ? row.startDate ?? "" : row.startAt ? row.startAt.toISOString() : "";
  const fallbackEnd = row.allDay ? row.endDate ?? row.startDate ?? "" : row.endAt ? row.endAt.toISOString() : fallbackStart;
  const start = typeof body.start === "string" ? body.start : fallbackStart;
  const end = typeof body.end === "string" ? body.end : fallbackEnd;
  if (allDay ? !DAY.test(start) || !DAY.test(end) || end < start : !RFC3339.test(start) || !RFC3339.test(end) || new Date(end) <= new Date(start)) {
    return Response.json({ error: "Provide a valid start and end, with the end after the start." }, { status: 400 });
  }

  try {
    const { client } = await accessTokenFor(account);
    const updated = await updateEvent(client, {
      calendarId: row.calendarId, eventId: row.googleEventId,
      summary: title, description, location, allDay, start, end,
      timeZone: typeof body.timeZone === "string" && body.timeZone ? body.timeZone : row.timezone,
    });
    const [next] = await db.update(googleEvents).set({
      title, description, location, allDay,
      startAt: allDay ? new Date(`${start}T12:00:00Z`) : new Date(start),
      endAt: allDay ? new Date(`${end}T12:00:00Z`) : new Date(end),
      startDate: allDay ? start : start.slice(0, 10),
      endDate: allDay ? end : end.slice(0, 10),
      timezone: updated.start?.timeZone ?? row.timezone,
      googleUpdatedAt: updated.updated ? new Date(updated.updated) : new Date(),
      localDirty: false, // Google has acknowledged this version
      updatedAt: new Date(),
    }).where(eq(googleEvents.id, row.id)).returning();
    return Response.json({ event: next });
  } catch (error) {
    if (error instanceof GoogleError) {
      if (error.needsReauth) await db.update(googleAccounts).set({ connectionError: error.message, revokedAt: new Date(), updatedAt: new Date() }).where(eq(googleAccounts.id, account.id));
      if (error.status === 410 || error.status === 404) {
        // The event vanished on Google: stop advertising a stale link.
        await db.delete(googleEvents).where(eq(googleEvents.id, row.id));
        return Response.json({ error: "That event no longer exists in Google Calendar. Folio removed the link." }, { status: 410 });
      }
      return Response.json({ error: error.message, needsReauth: error.needsReauth }, { status: 502 });
    }
    return Response.json({ error: "Google Calendar couldn’t update that event." }, { status: 502 });
  }
}

/** Deletes a Google event (with confirmation handled in the UI) and clears the link. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "Request not allowed." }, { status: 403 });
  const user = await getUser();
  const account = await loadAccount(user.id);
  if (!account) return Response.json({ error: "Google Calendar isn’t connected." }, { status: 400 });
  if (!account.writeEnabled) return Response.json({ error: "Folio doesn’t have permission to delete events.", upgradeRequired: true }, { status: 403 });
  const { id } = await context.params;
  const row = await resolve(user.id, id);
  if (!row) return Response.json({ error: "That event isn’t in your workspace." }, { status: 404 });
  try {
    const { client } = await accessTokenFor(account);
    await deleteEvent(client, { calendarId: row.calendarId, eventId: row.googleEventId });
    await db.delete(googleEvents).where(eq(googleEvents.id, row.id));
    return Response.json({ deleted: true });
  } catch (error) {
    if (error instanceof GoogleError && (error.status === 410 || error.status === 404)) {
      await db.delete(googleEvents).where(eq(googleEvents.id, row.id));
      return Response.json({ deleted: true, alreadyGone: true });
    }
    if (error instanceof GoogleError && error.needsReauth) await db.update(googleAccounts).set({ connectionError: error.message, revokedAt: new Date(), updatedAt: new Date() }).where(eq(googleAccounts.id, account.id));
    return Response.json({ error: error instanceof GoogleError ? error.message : "Google Calendar couldn’t delete that event." }, { status: 502 });
  }
}
