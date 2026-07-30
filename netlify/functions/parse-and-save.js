const { getStore } = require("@netlify/blobs");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Método no permitido." });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, {
      error:
        "Falta la variable de entorno ANTHROPIC_API_KEY en Netlify (Site settings > Environment variables).",
    });
  }

  try {
    const { text } = JSON.parse(event.body || "{}");
    if (!text || !text.trim()) return json(400, { error: "Falta el texto dictado." });

    const today = new Date().toISOString().slice(0, 10);

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        system:
          `Hoy es ${today}. Extraes datos de un RECORDATORIO a partir de una frase dictada en español. ` +
          `Puede ser una cita con hora ("Cita Odontología de Anthony el 28 de agosto a las 3pm"), un pendiente ` +
          `de todo el día ("mañana pagar renta"), o una meta con fecha límite ("para el viernes 5 de agosto ` +
          `tener $100 en la cuenta Chase de Antonio"). Respondes EXCLUSIVAMENTE con un objeto JSON válido, sin ` +
          `texto adicional, sin markdown, con estas claves: ` +
          `title (string, resume la acción, ej. "Pagar renta" o "Tener $100 en cuenta Chase"), ` +
          `person (string, persona o cuenta relacionada si se menciona, ej. "Antonio", si no vacío), ` +
          `date (string YYYY-MM-DD, resuelve fechas relativas como "mañana" o "el viernes" usando la fecha de hoy), ` +
          `time (string HH:MM en formato 24h SOLO si la frase menciona una hora explícita; si no, cadena vacía ` +
          `para que quede como recordatorio de todo el día), ` +
          `notes (string, detalles adicionales como montos o contexto, vacío si no aplica). ` +
          `Si no logras determinar una fecha concreta, usa la fecha de hoy.`,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return json(502, { error: `Error llamando a la API de Claude: ${errText}` });
    }

    const aiData = await aiResponse.json();
    const rawText = (aiData.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .replace(/```json|```/g, "");

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return json(502, { error: "No se pudo interpretar la respuesta del modelo.", raw: rawText });
    }

    if (!parsed.date) {
      return json(422, {
        error: "No se pudo determinar una fecha a partir del texto.",
        parsed,
      });
    }

    const id = newId();
    const appointment = {
      id,
      title: parsed.title || "Cita",
      person: parsed.person || "",
      date: parsed.date,
      time: parsed.time || "",
      notes: parsed.notes || "",
      status: "active",
      createdAt: new Date().toISOString(),
      source: "shortcut",
    };

    const s = getStore("appointments");
    await s.set(id, JSON.stringify(appointment));

    return json(201, { appointment });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
