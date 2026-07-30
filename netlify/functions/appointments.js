const { getStore } = require("@netlify/blobs");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...CORS },
    body: JSON.stringify(body),
  };
}

function store() {
  return getStore("appointments");
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function listAll(s) {
  const { blobs } = await s.list();
  const items = await Promise.all(
    blobs.map(async (b) => JSON.parse(await s.get(b.key)))
  );
  items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return items;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  const s = store();

  try {
    if (event.httpMethod === "GET") {
      const items = await listAll(s);
      return json(200, { appointments: items });
    }

    if (event.httpMethod === "POST") {
      const data = JSON.parse(event.body || "{}");
      if (!data.title || !data.date) {
        return json(400, { error: "Faltan campos requeridos: title, date." });
      }
      const id = newId();
      const appointment = {
        id,
        title: data.title,
        person: data.person || "",
        date: data.date,
        time: data.time || "",
        notes: data.notes || "",
        status: "active",
        createdAt: new Date().toISOString(),
      };
      await s.set(id, JSON.stringify(appointment));
      return json(201, { appointment });
    }

    if (event.httpMethod === "PUT") {
      const data = JSON.parse(event.body || "{}");
      if (!data.id) return json(400, { error: "Falta id." });
      const existingRaw = await s.get(data.id);
      if (!existingRaw) return json(404, { error: "Cita no encontrada." });
      const existing = JSON.parse(existingRaw);
      const updated = { ...existing, ...data };
      await s.set(data.id, JSON.stringify(updated));
      return json(200, { appointment: updated });
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (!id) return json(400, { error: "Falta id." });
      await s.delete(id);
      return json(200, { deleted: id });
    }

    return json(405, { error: "Método no permitido." });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
