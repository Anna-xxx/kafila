// screenpath-api: AI proxy for ScreenPath on Cloudflare Workers. New Worker, separate from Sputnik (do not reuse sputnik-api).
// Based on Sputnik 2.0 sputnik-api.js: same idea (keys only in Worker secrets, model fallback list, prepared answer if AI fails),
// space parts removed (voice, DONKI, mission room, camera).
// Routes: POST /ai, POST /tts (Gemini voice), GET / (status), GET /check (is the Gemini key valid, key never shown).
// Secrets (Anna enters them in Cloudflare → Settings → Variables and Secrets): GEMINI_API_KEY (new key for this project).
//   Optional: ANTHROPIC_API_KEY (then Claude answers first, Gemini is the backup).
// Variables (not secret): ALLOWED_ORIGIN = address of the ScreenPath page (comma-separated for several). GEMINI_MODEL to override the model list.
// Safety: the page checks red flags before calling us; we check again here (defence in depth) and never send a red-flag message to the model.
// The model receives the zone, level and next step from the rules engine and the approved content snippets. It explains only.

const RULES = `You are the Kafila assistant. You help adults understand a screening test result they already received and get to the follow-up visit.
You are an AI assistant, not a doctor. Say so if asked. Never pretend to be human.
Answer in 2-4 short sentences in plain words (reading level about grade 6), in the language of the question (ar = Arabic, en = English).
Use ONLY the facts in ctx.result (zone, level, next step, window, compare) and ctx.content (approved texts with source ids). Do not add numbers, intervals or statistics that are not there.
Never change the zone, level or deadline. You may set "raise": true if the person describes a new symptom; this only asks a clinician to review, it never changes the level. You may never lower urgency.
Never diagnose ("you have cancer", "you are fine", "nothing to worry about"). Never name medicines or doses. Never say they can skip or delay the follow-up.
If the question is outside the content, say you cannot answer that safely and offer the care team or booking.
No jokes about health. Be warm and calm, do not frighten.
Every number must say what it is compared with: put that in field c.
Return JSON only: {"a":"answer","c":"Compared with: ...","src":["content ids you used"],"raise":false}`;

const BANNED = [/(?<!not mean )(?<!n't mean )(?<!not that )you have (colon |bowel )?cancer/i, /you are fine/i, /nothing to worry/i, /no need (to see|for) (a )?doctor/i, /skip the colonoscopy/i, /\b\d+\s?mg\b/i, /diagnos(is|ed) (is|with)/i];
const RED = ["chest pain", "can't breathe", "cannot breathe", "short of breath", "faint", "passed out", "heavy bleeding", "bleeding a lot", "lot of blood", "seizure", "kill myself", "suicide", "want to die", "self harm", "self-harm",
  "shortness of breath", "chest hurts", "pain in my chest", "heart attack", "stroke", "bleeding heavily", "suicidal", "kill my self",
  "ألم في الصدر", "ألم بالصدر", "صدري يؤلمني", "ضيق في التنفس", "ضيق تنفس", "إغماء", "نزيف شديد", "نزيف كثير", "انتحار", "أريد أن أموت"];

const CORS = { "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const T = (ms) => AbortSignal.timeout(ms);
function corsFor(req, env) {
  const allow = (env.ALLOWED_ORIGIN || "").split(",").map((x) => x.trim().replace(/\/$/, "")).filter(Boolean);
  const o = req.headers.get("Origin") || "";
  const ok = !allow.length || allow.includes(o);   // until ALLOWED_ORIGIN is set, any page may call (demo only)
  return { ok, h: { ...CORS, "Access-Control-Allow-Origin": allow.length ? (allow.includes(o) ? o : allow[0]) : "*", Vary: "Origin" } };
}
// Soft rate limit: 20 AI calls a minute per address (per Worker instance; demo guard, not a hard limit)
const HITS = new Map();
function limited(req) {
  const ip = req.headers.get("cf-connecting-ip") || "x", now = Date.now(), w = (HITS.get(ip) || []).filter((t) => now - t < 60000);
  w.push(now); HITS.set(ip, w);
  if (HITS.size > 500) for (const [k, v] of HITS) if (!v.some((t) => now - t < 60000)) HITS.delete(k);
  return w.length > 20;
}

async function ai(req, env) {
  const { q = "", lang = "en", ctx = {} } = await req.json().catch(() => ({}));
  const question = String(q).slice(0, 500);
  const norm = (x) => String(x).toLowerCase().replace(/['’`]/g, "").replace(/[\u064B-\u0652\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ");
  const low = norm(question);
  if (RED.some((w) => low.includes(norm(w)))) return J({ error: "red_flag", noAI: true }, 200);   // page shows the fixed safe answer
  const user = `lang=${lang}\nctx (from rules engine and approved content library): ${JSON.stringify(ctx).slice(0, 6000)}\nQuestion: ${question}`;
  let prov = env.ANTHROPIC_API_KEY ? "claude" : "gemini", text = "", why = "";
  try {
    if (prov === "claude") {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: env.CLAUDE_MODEL || "claude-haiku-5-5", max_tokens: 800, system: RULES, messages: [{ role: "user", content: user }] }), signal: T(8000) })
        .catch((e) => ({ ok: false, status: e && e.name === "TimeoutError" ? "timeout" : "network" }));
      if (r.ok) { const j = await r.json(); text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join(""); }
      else why = `claude_${r.status} | `;
    }
    if (!text) {
      if (!env.GEMINI_API_KEY) return J({ error: "ai_failed", why: why + "no_key" }, 502);
      const list = (env.GEMINI_MODEL || "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest,gemini-3.8-flash").split(",");
      for (const m of list) {
        const call = (gc) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m.trim()}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, { method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: RULES }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: gc }), signal: T(6000) })
          .catch((e) => ({ ok: false, status: e && e.name === "TimeoutError" ? "timeout" : "network", text: async () => "" }));
        const base = { maxOutputTokens: 1000, responseMimeType: "application/json" };
        let r = await call({ ...base, thinkingConfig: { thinkingLevel: "minimal" } });
        if (r.status === 400) r = await call(base);
        if (!r.ok) { why += `gemini_${m.trim()}_${r.status} | `; continue; }
        const j = await r.json(); text = (j.candidates?.[0]?.content?.parts || []).filter((x) => x.text && !x.thought).map((x) => x.text).join("");
        if (text) break; why += `gemini_${m.trim()}_empty | `;
      }
    }
  } catch (e) { return J({ error: "ai_failed", why: e && e.name === "TimeoutError" ? "timeout" : "network" }, 502); }
  if (!text) { console.log("ai_failed", why); return J({ error: "ai_failed", why }, 502); }
  let out; try { out = JSON.parse(text.replace(/^```json|```$/g, "").trim()); } catch (e) { out = { a: text }; }
  // Output guard: a diagnosis, reassurance or dose phrase → refuse, the page shows the prepared answer instead.
  if (BANNED.some((re) => re.test(String(out.a || "")))) { console.log("guard_blocked"); return J({ error: "guard_blocked" }, 200); }
  out.model = prov === "claude" && !why ? "claude" : "gemini";
  return J(out);
}

// Text-to-speech with Gemini (POST /tts {text, lang}). Only short approved texts from the page: result card and
// assistant answers. Red-flag texts are refused (the page never sends them; checked again here). No names are sent.
// Model list from GEMINI_TTS_MODEL (comma-separated), voice from GEMINI_TTS_VOICE. Returns audio/wav.
function wavFromPcm(pcm, rate = 24000) {
  const h = new ArrayBuffer(44), v = new DataView(h), w = (o, t) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length); out.set(new Uint8Array(h), 0); out.set(pcm, 44); return out;
}
async function tts(req, env) {
  if (!env.GEMINI_API_KEY) return J({ error: "no_key" }, 503);
  const { text = "", lang = "en" } = await req.json().catch(() => ({}));
  const t = String(text).replace(/\s+/g, " ").trim().slice(0, 600);
  if (!t) return J({ error: "empty" }, 400);
  const norm = (x) => String(x).toLowerCase().replace(/['’`]/g, "").replace(/[\u064B-\u0652\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  if (RED.some((w) => norm(t).includes(norm(w)))) return J({ error: "red_flag", noAI: true }, 200);
  const voice = env.GEMINI_TTS_VOICE || "Sulafat";
  const style = lang === "ar" ? "Read this in clear, calm Modern Standard Arabic, warm and unhurried, like a kind nurse:" : "Read this in a clear, calm, warm voice, unhurried, like a kind nurse:";
  const models = (env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-2.5-flash-preview-tts").split(",").map((m) => m.trim()).filter(Boolean);
  const bodies = [{ voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }, { voiceConfig: { voice } }];
  let why = "";
  for (const m of models) for (const speechConfig of bodies) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", signal: T(15000),
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: style + "\n" + t }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig } }) }).catch(() => null);
    if (!r) { why += m + ":network "; continue; }
    if (!r.ok) { why += m + ":" + r.status + " "; if (r.status === 400) continue; break; }
    const j = await r.json().catch(() => ({}));
    const part = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const d = (part.find((x) => x.inlineData) || {}).inlineData;
    if (!d || !d.data) { why += m + ":no_audio "; continue; }
    const bin = Uint8Array.from(atob(d.data), (ch) => ch.charCodeAt(0));
    const isWav = bin[0] === 82 && bin[1] === 73 && bin[2] === 70 && bin[3] === 70;
    const rate = +((d.mimeType || "").match(/rate=(\d+)/) || [])[1] || 24000;
    return new Response(isWav ? bin : wavFromPcm(bin, rate), { headers: { ...CORS, "content-type": "audio/wav", "cache-control": "no-store", "x-tts-model": m } });
  }
  return J({ error: "tts_failed", why: why.trim() }, 502);
}

async function route(req, env, ok) {
  const p = new URL(req.url).pathname;
  if (p === "/ai" && req.method === "POST") {
    if (!ok) return J({ error: "origin_not_allowed" }, 403);
    if (limited(req)) return J({ error: "rate_limited" }, 429);
    return ai(req, env);
  }
  if (p === "/tts" && req.method === "POST") {
    if (!ok) return J({ error: "origin_not_allowed" }, 403);
    if (limited(req)) return J({ error: "rate_limited" }, 429);
    return tts(req, env);
  }
  if (p === "/check" && req.method === "GET") {
    if (!env.GEMINI_API_KEY) return J({ gemini: "no_key" });
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=" + encodeURIComponent(env.GEMINI_API_KEY), { signal: T(8000) }).catch(() => null);
    if (!r) return J({ gemini: "network" }, 502);
    return J({ gemini: r.ok ? "ok" : r.status });
  }
  if (p === "/" || p === "/status") return J({ ok: true, name: "screenpath-api", version: env.DEMO_VERSION || "dev", model: env.ANTHROPIC_API_KEY ? "claude+gemini" : env.GEMINI_API_KEY ? "gemini" : "none (prepared answers only)" });
  return J({ error: "not_found", path: p }, 404);
}

export default {
  async fetch(req, env) {
    const { ok, h } = corsFor(req, env);
    if (req.method === "OPTIONS") return new Response(null, { headers: h });
    const res = await route(req, env, ok);
    for (const [k, v] of Object.entries(h)) res.headers.set(k, v);
    return res;
  }
};
