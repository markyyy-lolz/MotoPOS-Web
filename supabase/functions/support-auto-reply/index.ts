import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const ENGINE = "motopos-auto-support-v1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getKeySet(name: string, fallback: string) {
  try {
    const raw = Deno.env.get(name);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return String(parsed.default);
    }
  } catch (_) {}
  return Deno.env.get(fallback) || "";
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9.'@]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTerm(raw: string, normalized: string, term: string) {
  const rawTerm = String(term || "").toLowerCase().trim();
  const normalizedTerm = normalize(rawTerm);
  return (rawTerm && raw.includes(rawTerm)) ||
    (normalizedTerm && normalized.includes(normalizedTerm));
}

function scoreRule(raw: string, normalized: string, terms: string[]) {
  let score = 0;
  for (const term of terms || []) {
    if (!containsTerm(raw, normalized, term)) continue;
    const n = normalize(term);
    const words = n.split(" ").filter(Boolean).length;
    score += Math.max(3, words * 3) + Math.min(6, n.length / 8);
    if (normalized === n) score += 10;
    if (/\d/.test(n) && raw.includes(String(term).toLowerCase())) score += 8;
  }
  return score;
}

const resolvedSignals = [
  "ok na", "okay na", "fixed", "solved", "working now", "gumagana na",
  "ayos na", "thank you", "thanks", "salamat"
];

const humanSignals = [
  "human support", "human agent", "support agent", "talk to admin",
  "kausapin admin", "developer please", "tao na lang", "human na lang"
];

const unresolvedSignals = [
  "still not working", "same issue", "ayaw pa rin", "ayaw parin",
  "hindi pa rin", "di pa rin", "same error", "wala pa rin", "ganun pa rin"
];

const HANDOFF_MESSAGE =
  "This request needs MotoPOS Support. A human administrator will review this conversation.";

async function insertAutoMessage(adminClient: any, thread: any, latest: any, body: string, meta: Record<string, unknown>) {
  const { data, error } = await adminClient
    .from("support_messages")
    .insert({
      thread_id: thread.id,
      shop_id: thread.shop_id,
      sender_id: null,
      sender_type: "ai",
      body: body.slice(0, 4000),
      in_reply_to: latest.id,
      ai_model: ENGINE,
      ai_meta: { engine: ENGINE, external_ai: false, ...meta },
    })
    .select("id,body,created_at")
    .single();

  if (error) {
    if (String(error.code || "") === "23505") return { duplicate: true, message: null };
    throw error;
  }
  return { duplicate: false, message: data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Authentication required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = getKeySet("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = getKeySet("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ error: "MotoPOS support backend is not configured." }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: "Invalid session." }, 401);

  let payload: any = {};
  try { payload = await req.json(); } catch (_) {}
  const threadId = String(payload?.thread_id || "").trim();
  if (!threadId) return json({ error: "thread_id is required." }, 400);

  const { data: thread, error: threadError } = await userClient
    .from("support_threads")
    .select("id,shop_id,subject,status,priority,ai_enabled,ai_handoff,auto_rule_code,auto_step,auto_unmatched_attempts,shop:shops(name)")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) return json({ error: "Support thread not found or access denied." }, 404);
  if (thread.status === "closed") return json({ skipped: "closed" });
  if (!thread.ai_enabled) return json({ skipped: "auto_support_disabled" });
  if (thread.ai_handoff) return json({ skipped: "human_handoff" });

  const { data: recent, error: messagesError } = await userClient
    .from("support_messages")
    .select("id,body,sender_type,created_at,ai_model,ai_meta")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(16);

  if (messagesError) return json({ error: "Unable to read support history." }, 500);
  const messages = [...(recent || [])].reverse();
  const latest = messages[messages.length - 1];
  if (!latest || latest.sender_type !== "customer") return json({ skipped: "latest_not_customer" });

  const { data: existing } = await adminClient
    .from("support_messages")
    .select("id")
    .eq("sender_type", "ai")
    .eq("in_reply_to", latest.id)
    .maybeSingle();

  if (existing) return json({ skipped: "already_replied", message_id: existing.id });

  const raw = String(latest.body || "").toLowerCase();
  const normalized = normalize(latest.body || "");

  if (resolvedSignals.some((term) => containsTerm(raw, normalized, term))) {
    const text = "Glad to hear it’s working. I’ll leave this conversation open in case you need anything else.";
    const inserted = await insertAutoMessage(adminClient, thread, latest, text, {
      category: "resolved",
      rule_code: null,
      step: 0,
      handoff: false,
    });
    await adminClient.from("support_threads").update({
      auto_rule_code: null,
      auto_step: 0,
      auto_unmatched_attempts: 0,
      ai_last_reply_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", thread.id);
    return json({ ok: true, engine: ENGINE, external_ai: false, handoff: false, ...inserted });
  }

  if (humanSignals.some((term) => containsTerm(raw, normalized, term))) {
    const inserted = await insertAutoMessage(adminClient, thread, latest, HANDOFF_MESSAGE, {
      category: "human_request",
      rule_code: null,
      step: 0,
      handoff: true,
    });
    await adminClient.from("support_threads").update({
      ai_handoff: true,
      status: "pending",
      ai_last_reply_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", thread.id);
    return json({ ok: true, engine: ENGINE, external_ai: false, handoff: true, ...inserted });
  }

  const { data: rules, error: rulesError } = await adminClient
    .from("support_auto_rules")
    .select("code,category,title,match_terms,response_steps,handoff_immediately,priority")
    .eq("is_active", true)
    .order("priority", { ascending: false });

  if (rulesError) {
    console.error("Auto support rules unavailable", rulesError.code, rulesError.message);
    return json({ error: "Auto support knowledge base is unavailable." }, 500);
  }

  let matched: any = null;
  let matchedScore = 0;

  if (thread.auto_rule_code && unresolvedSignals.some((term) => containsTerm(raw, normalized, term))) {
    matched = (rules || []).find((r: any) => r.code === thread.auto_rule_code) || null;
    matchedScore = matched ? 999 : 0;
  }

  if (!matched) {
    for (const rule of rules || []) {
      const score = scoreRule(raw, normalized, Array.isArray(rule.match_terms) ? rule.match_terms : []);
      if (score > matchedScore) {
        matched = rule;
        matchedScore = score;
      }
    }
  }

  if (!matched || matchedScore < 3) {
    const attempts = Number(thread.auto_unmatched_attempts || 0) + 1;
    const handoff = attempts >= 2;
    const text = handoff
      ? "I couldn’t match this issue to a safe MotoPOS troubleshooting guide after two attempts. " + HANDOFF_MESSAGE
      : "I want to diagnose this correctly. Please reply with: 1) the exact error text, 2) whether you are using MotoPOS Web or Android, and 3) what you were doing immediately before the problem appeared.";

    const inserted = await insertAutoMessage(adminClient, thread, latest, text, {
      category: "unmatched",
      rule_code: null,
      step: attempts,
      handoff,
    });

    await adminClient.from("support_threads").update({
      auto_unmatched_attempts: attempts,
      ai_handoff: handoff,
      status: handoff ? "pending" : thread.status,
      ai_last_reply_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", thread.id);

    return json({ ok: true, engine: ENGINE, external_ai: false, matched: false, handoff, ...inserted });
  }

  const steps = Array.isArray(matched.response_steps) ? matched.response_steps.map(String) : [];
  let step = thread.auto_rule_code === matched.code ? Number(thread.auto_step || 0) + 1 : 1;
  const exhausted = step > steps.length;
  const handoff = Boolean(matched.handoff_immediately) || exhausted;

  let reply = exhausted
    ? "The guided troubleshooting steps for this issue are already exhausted. " + HANDOFF_MESSAGE
    : String(steps[Math.max(0, step - 1)] || "");

  if (matched.handoff_immediately && !reply.includes(HANDOFF_MESSAGE)) {
    reply = reply.trim() + "\n\n" + HANDOFF_MESSAGE;
  }

  const inserted = await insertAutoMessage(adminClient, thread, latest, reply, {
    category: matched.category,
    rule_code: matched.code,
    rule_title: matched.title,
    score: Number(matchedScore.toFixed(2)),
    step,
    handoff,
  });

  await adminClient.from("support_threads").update({
    auto_rule_code: matched.code,
    auto_step: Math.min(step, Math.max(steps.length, 1)),
    auto_unmatched_attempts: 0,
    ai_handoff: handoff,
    status: handoff ? "pending" : thread.status,
    ai_last_reply_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", thread.id);

  return json({
    ok: true,
    engine: ENGINE,
    external_ai: false,
    matched: true,
    category: matched.category,
    rule_code: matched.code,
    score: matchedScore,
    step,
    handoff,
    ...inserted,
  });
});
