/**
 * 토스애즈 잠재고객 모으기 웹훅 수신기
 * 가이드: https://toss-ads.gitbook.io/guide/tracking/webhook
 */

type TossUserColumn = {
  column_id?: string;
  column_name?: string;
  string_value?: string;
};

type TossSubmittedContent = {
  id?: number;
  question?: string;
  answer?: string[];
};

type TossConsensus = {
  terms_id?: number;
  agreed_at?: string;
};

type TossLeadPayload = {
  api_version?: string;
  is_test?: boolean;
  lead_id?: number;
  form_id?: number;
  campaign_id?: number;
  ad_set_id?: number;
  ad_id?: number;
  tracking_click_id?: string;
  lead_submit_time?: string;
  user_column_data?: TossUserColumn[];
  submitted_content?: TossSubmittedContent[];
  consensus_histories?: TossConsensus[];
  [key: string]: unknown;
};

const TIMESTAMP_TOLERANCE_SEC = 300;
const LEAD_TTL_SEC = 60 * 60 * 24 * 90; // 90일
const PROCESSING_TTL_SEC = 60 * 10;

function jsonResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

async function hmacSha256Hex(secret: string, data: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return [...new Uint8Array(sig)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function collectSecrets(env: Env): string[] {
  const secrets = [env.TOSS_ADS_WEBHOOK_SECRET_KEY, env.TOSS_ADS_WEBHOOK_SECRET_KEY_PREV]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());
  return [...new Set(secrets)];
}

async function verifyTossSignature(
  secrets: string[],
  timestamp: string,
  signatureHeader: string,
  rawBody: Uint8Array,
): Promise<boolean> {
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const signingInput = new Uint8Array(prefix.length + rawBody.length);
  signingInput.set(prefix, 0);
  signingInput.set(rawBody, prefix.length);

  const provided = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      const eq = part.indexOf("=");
      return eq >= 0 ? part.slice(eq + 1).trim() : "";
    })
    .filter(Boolean);

  if (provided.length === 0) return false;

  for (const secret of secrets) {
    const expected = await hmacSha256Hex(secret, signingInput);
    if (provided.some((sig) => timingSafeEqualHex(expected, sig))) {
      return true;
    }
  }
  return false;
}

function columnValue(columns: TossUserColumn[] | undefined, id: string): string {
  if (!columns) return "";
  const found = columns.find(
    (col) =>
      col.column_id === id ||
      col.column_name === id ||
      (id === "name" && (col.column_name === "이름" || col.column_id === "name")) ||
      (id === "phone" &&
        (col.column_name === "연락처" ||
          col.column_name === "전화번호" ||
          col.column_id === "phone")),
  );
  return found?.string_value?.trim() || "";
}

async function forwardToAppsScript(
  env: Env,
  payload: TossLeadPayload,
  rawBodyText: string,
): Promise<void> {
  const url = new URL(env.APPS_SCRIPT_URL);
  url.searchParams.set("source", "toss");
  url.searchParams.set("key", env.APPS_SCRIPT_FORWARD_SECRET);

  const name = columnValue(payload.user_column_data, "name");
  const phone = columnValue(payload.user_column_data, "phone");

  const body = {
    source: "toss",
    is_test: Boolean(payload.is_test),
    lead_id: payload.lead_id,
    form_id: payload.form_id,
    campaign_id: payload.campaign_id,
    ad_set_id: payload.ad_set_id,
    ad_id: payload.ad_id,
    tracking_click_id: payload.tracking_click_id || "",
    lead_submit_time: payload.lead_submit_time || "",
    name,
    phone,
    user_column_data: payload.user_column_data || [],
    submitted_content: payload.submitted_content || [],
    consensus_histories: payload.consensus_histories || [],
    raw_body: rawBodyText,
  };

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "follow",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Apps Script forward failed: ${response.status} ${text}`);
  }
}

async function claimLead(env: Env, leadId: number): Promise<"duplicate" | "claimed"> {
  const key = `toss:lead:${leadId}`;
  const existing = await env.LEAD_KV.get(key);
  if (existing === "done" || existing === "processing") {
    return "duplicate";
  }
  await env.LEAD_KV.put(key, "processing", { expirationTtl: PROCESSING_TTL_SEC });
  return "claimed";
}

async function markLeadDone(env: Env, leadId: number): Promise<void> {
  await env.LEAD_KV.put(`toss:lead:${leadId}`, "done", { expirationTtl: LEAD_TTL_SEC });
}

async function releaseLeadClaim(env: Env, leadId: number): Promise<void> {
  await env.LEAD_KV.delete(`toss:lead:${leadId}`);
}

async function handleTossWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, "Method Not Allowed");
  }

  const timestamp = request.headers.get("X-TossAds-Timestamp") || "";
  const signature = request.headers.get("X-TossAds-Signature") || "";
  if (!timestamp || !signature) {
    return jsonResponse(400, "Missing required header");
  }

  const secrets = collectSecrets(env);
  if (secrets.length === 0) {
    console.error(JSON.stringify({ event: "missing_secret" }));
    return jsonResponse(500, "Server misconfigured");
  }

  const rawBuffer = new Uint8Array(await request.arrayBuffer());

  const signatureOk = await verifyTossSignature(secrets, timestamp, signature, rawBuffer);
  if (!signatureOk) {
    return jsonResponse(401, "Invalid signature");
  }

  const requestTime = Number(timestamp);
  if (!Number.isFinite(requestTime)) {
    return jsonResponse(400, "Invalid timestamp");
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - requestTime) > TIMESTAMP_TOLERANCE_SEC) {
    return jsonResponse(401, "Timestamp expired");
  }

  let payload: TossLeadPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBuffer)) as TossLeadPayload;
  } catch {
    return jsonResponse(400, "Invalid JSON body");
  }

  const leadId = Number(payload.lead_id);
  if (!Number.isFinite(leadId)) {
    return jsonResponse(400, "Missing lead_id");
  }

  const claim = await claimLead(env, leadId);
  if (claim === "duplicate") {
    return jsonResponse(200, "OK");
  }

  const rawBodyText = new TextDecoder().decode(rawBuffer);
  ctx.waitUntil(
    (async () => {
      try {
        await forwardToAppsScript(env, payload, rawBodyText);
        await markLeadDone(env, leadId);
        console.log(
          JSON.stringify({
            event: "toss_lead_saved",
            lead_id: leadId,
            is_test: Boolean(payload.is_test),
          }),
        );
      } catch (error) {
        await releaseLeadClaim(env, leadId);
        console.error(
          JSON.stringify({
            event: "toss_lead_save_failed",
            lead_id: leadId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    })(),
  );

  return jsonResponse(200, "OK");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/api/toss-webhook")) {
      return jsonResponse(200, "toss-webhook ready");
    }

    if (url.pathname === "/api/toss-webhook" || url.pathname === "/") {
      return handleTossWebhook(request, env, ctx);
    }

    return jsonResponse(404, "Not Found");
  },
} satisfies ExportedHandler<Env>;
