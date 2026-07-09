// Netlify Function — shared backend for the Event Gear Tracker.
// Stores one JSON document (equipment / events / bookings / retirements / manualHolds) in
// Netlify Blobs so every user hitting the site sees the same live data.
//
// GET  /api/data   -> returns the current document
// POST /api/data   -> saves a new document. Body: { data, expectedVersion }
//                     Uses a simple version counter for optimistic concurrency:
//                     if someone else saved in between your load and your save,
//                     the request is rejected with 409 and the latest data is
//                     returned so the client can refresh instead of silently
//                     clobbering the other person's change.

import { getStore } from "@netlify/blobs";

const KEY = "gear-tracker-data";

function blankDoc() {
  return { equipment: [], events: [], bookings: [], retirements: [], manualHolds: [], version: 0 };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export default async (req, context) => {
  const store = getStore({ name: "gear-tracker", consistency: "strong" });

  if (req.method === "GET") {
    const current = (await store.get(KEY, { type: "json" })) || blankDoc();
    return json(current);
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const incoming = body && body.data;
    const expectedVersion = body ? body.expectedVersion : undefined;
    if (!incoming || typeof incoming !== "object") {
      return json({ error: "Missing data" }, 400);
    }

    const current = (await store.get(KEY, { type: "json" })) || blankDoc();

    if (typeof expectedVersion === "number" && expectedVersion !== current.version) {
      // Someone else saved since this client last loaded — don't overwrite their work.
      return json({ error: "conflict", data: current }, 409);
    }

    const next = {
      equipment: incoming.equipment || [],
      events: incoming.events || [],
      bookings: incoming.bookings || [],
      retirements: incoming.retirements || [],
      manualHolds: incoming.manualHolds || [],
      version: (current.version || 0) + 1,
    };

    await store.setJSON(KEY, next);
    return json(next);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/data" };
