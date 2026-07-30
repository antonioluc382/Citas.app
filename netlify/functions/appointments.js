const BIN_ID = process.env.JSONBIN_BIN_ID;
const API_KEY = process.env.JSONBIN_API_KEY;
const BASE = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

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

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readAll() {
  const res = await fetch(`${BASE}/latest`, {
    headers: { "X-Master-Key": API_KEY },
  });
  if (!res.ok) throw new Error(`JSONBin read error: ${res.status}`);
  const data = await res.json();
  return (data.record && data.record.appointments) || [];
}

async function writeAll(appointments) {
  const res = await fetch(BASE, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": API_KEY,
    },
    body: JSON.stringify({ appointments }),
  });
  if (!res.ok) throw new Error(`JSONBin write error: ${res.status}`);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  if (!BIN_ID || !API_KEY) {
    return json(500, { error: "Faltan JSONBIN_BIN_ID o JSONBIN_API_KEY en las variables de entorno de Netlify." });
  }

  try {
    if (event.httpMethod === "GET") {
      const items = await readAll();
      items.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
      return json(200, { appointments: items });
    }

    if (event.httpMethod === "POST") {
      const data = JSON.parse(event.body || "{}");
      if (!data.title || !data.date) {
        return json(400, { error: "Faltan campos requeridos: title, date." });
      }
      const items = await readAll();
      const appointment = {
        id: newId(),
        title: data.title,
        person: data.person || "",
        date: data.date,
        time: data.time || "",
        notes: data.notes || "",
        status: "active",
        createdAt: new Date().toISOString(),
      };
      items.push(appointment);
      await writeAll(items);
      return json(201, { appointment });
    }

    if (event.httpMethod === "PUT") {
      const data = JSON.parse(event.body || "{}");
      if (!data.id) return json(400, { error: "Falta id." });
      const items = await readAll();
      const idx = items.findIndex((a) => a.id === data.id);
      if (idx === -1) return json(404, { error: "Cita no encontrada." });
      items[idx] = { ...items[idx], ...data };
      await writeAll(items);
      return json(200, { appointment: items[idx] });
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (!id) return json(400, { error: "Falta id." });
      const items = await readAll();
      const filtered = items.filter((a) => a.id !== id);
      await writeAll(filtered);
      return json(200, { deleted: id });
    }

    return json(405, { error: "Método no permitido." });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
