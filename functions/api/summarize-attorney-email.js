const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export async function onRequestPost({ request, env }) {
  if (!env.OPENAI_API_KEY) {
    return json({ error: "AI task generation is not configured yet. Add the firm’s OpenAI API key to the Pages project." }, 503);
  }

  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return json({ error: "Sign in to the staff workspace first." }, 401);

  const token = match[1];
  const firebaseApiKey = "AIzaSyBSRANSn7e2npR9SZ_tRdtxwe8QH-VAVUA";
  try {
    const identityResponse = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + firebaseApiKey, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token })
    });
    const identity = await identityResponse.json();
    const uid = identity.users?.[0]?.localId;
    if (!identityResponse.ok || !uid || identity.users[0].disabled) {
      return json({ error: "Your staff session has expired. Sign in again." }, 401);
    }

    const profileResponse = await fetch(
      "https://firestore.googleapis.com/v1/projects/family-law-firm/databases/(default)/documents/users/" + encodeURIComponent(uid),
      { headers: { authorization: "Bearer " + token } }
    );
    const profile = profileResponse.ok ? await profileResponse.json() : null;
    const role = profile?.fields?.role?.stringValue;
    const activeAdmin = role === "admin" && profile?.fields?.Active?.booleanValue === true;
    if (!activeAdmin && role !== "solicitor") {
      return json({ error: "Only an active administrator or solicitor can generate tasks from attorney email." }, 403);
    }

    const data = await request.json();
    const from = String(data.from || "").slice(0, 254);
    const subject = String(data.subject || "").slice(0, 160);
    const received = String(data.received || "").slice(0, 30);
    const body = String(data.body || "").trim();
    if (!subject || !body || body.length > 8000) {
      return json({ error: "Email subject and body are required (maximum 8,000 characters)." }, 400);
    }

    const prompt = [
      "Summarize this attorney email for an Australian family law office and suggest one task for staff review.",
      "Do not give legal advice, make legal conclusions, or invent facts, actions, or dates.",
      "The deadline must be YYYY-MM-DD only when a specific deadline is explicitly stated; otherwise use an empty string.",
      "Use one concise task title. Include a short summary and any exact next step in task notes.",
      "Choose priority Urgent only for an explicit imminent court/deadline risk, High for a clear near-term deadline, otherwise Normal. Never infer a deadline.",
      "Return a JSON object with exactly these fields: summary (string), task (object with title, notes, deadline, priority).",
      "",
      "From: " + from,
      "Received: " + received,
      "Subject: " + subject,
      "Email body:",
      body
    ].join("\n");

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: "Bearer " + env.OPENAI_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions: "You are a careful administrative assistant. Work only from the supplied email. Return valid JSON only.",
        input: prompt,
        max_output_tokens: 1000,
        text: { format: { type: "json_object" } }
      })
    });
    const result = await aiResponse.json();
    if (!aiResponse.ok) {
      return json({ error: "The OpenAI service could not create a summary. Check the server configuration and try again." }, 502);
    }
    const output = result.output_text || (result.output || [])
      .flatMap(item => item.content || [])
      .map(item => item.text || "")
      .join("");
    let suggestion;
    try {
      suggestion = JSON.parse(output);
    } catch {
      return json({ error: "The AI response could not be read. Please review the email and create the task manually." }, 502);
    }

    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(suggestion.task?.deadline || "") ? suggestion.task.deadline : "";
    const allowedPriority = ["Urgent", "High", "Normal", "Low"].includes(suggestion.task?.priority)
      ? suggestion.task.priority : "Normal";
    return json({
      summary: String(suggestion.summary || "").slice(0, 1800),
      task: {
        title: String(suggestion.task?.title || ("Review attorney email: " + subject)).slice(0, 160),
        notes: String(suggestion.task?.notes || suggestion.summary || "").slice(0, 4000),
        deadline,
        priority: allowedPriority
      }
    });
  } catch {
    return json({ error: "Could not create the task suggestion. Try again or enter the task manually." }, 500);
  }
}
