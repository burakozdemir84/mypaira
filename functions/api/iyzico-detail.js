// Cloudflare Pages Function: POST /api/iyzico-detail
//
// Make.com calls this endpoint after an iyzico "İşyeri Bildirimi" webhook
// arrives. It queries iyzico for the payment details and returns a single,
// flat JSON object that Make can map into e-mails and invoices.
//
// Request (JSON):  { "token": "...", "paymentId": "...", "conversationId": "..." }
// Header:          X-PAIRA-KEY: <shared secret, env.PAIRA_AUTOMATION_KEY>
//
// Bindings / secrets expected on the Pages project:
//   env.IYZICO_API_KEY         -> iyzico production API key
//   env.IYZICO_SECRET_KEY      -> iyzico production secret key
//   env.PAIRA_AUTOMATION_KEY   -> shared secret; Make sends it as X-PAIRA-KEY
//   env.IYZICO_BASE_URL        -> optional, defaults to https://api.iyzipay.com
//
// Ticket mapping is by paid amount (KDV dahil): 9000 -> fiziki, 5000 -> cevrimici.

const PRODUCTS = [
  { amount: 9000, code: "fiziki", label: "Fiziki katılım" },
  { amount: 5000, code: "cevrimici", label: "Çevrimiçi katılım" },
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function hmacSha256Hex(key, message) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// IYZWSv2 signature: HMAC-SHA256(secret, randomKey + uriPath + body)
async function iyzicoRequest(env, method, path, bodyObj) {
  const base = env.IYZICO_BASE_URL || "https://api.iyzipay.com";
  const randomKey = Date.now() + "" + Math.floor(Math.random() * 1e9);
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const signature = await hmacSha256Hex(env.IYZICO_SECRET_KEY, randomKey + path + body);
  const authString = `apiKey:${env.IYZICO_API_KEY}&randomKey:${randomKey}&signature:${signature}`;
  const headers = {
    Authorization: "IYZWSv2 " + btoa(authString),
    "x-iyzi-rnd": randomKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const r = await fetch(base + path, { method, headers, body: body || undefined });
  const text = await r.text();
  try { return JSON.parse(text); } catch (_e) { return { status: "failure", raw: text, httpStatus: r.status }; }
}

function pickProduct(paidPrice) {
  const n = Number(paidPrice);
  for (const p of PRODUCTS) if (Math.abs(n - p.amount) < 1) return p;
  return { amount: n, code: "diger", label: "Diğer" };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.PAIRA_AUTOMATION_KEY || request.headers.get("x-paira-key") !== env.PAIRA_AUTOMATION_KEY) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!env.IYZICO_API_KEY || !env.IYZICO_SECRET_KEY) {
    return json({ ok: false, error: "iyzico credentials missing" }, 500);
  }

  let input;
  try { input = await request.json(); } catch (_e) { return json({ ok: false, error: "invalid json" }, 400); }
  const token = (input.token || "").toString().trim();
  const paymentId = (input.paymentId || input.iyziPaymentId || "").toString().trim();
  const conversationId = (input.conversationId || input.paymentConversationId || "").toString().trim();
  if (!token && !paymentId) return json({ ok: false, error: "token or paymentId required" }, 400);

  // 1) Checkout-form style retrieve by token (iyzilink payments carry a token).
  let byToken = null;
  if (token) {
    byToken = await iyzicoRequest(env, "POST", "/payment/iyzipos/checkoutform/auth/ecom/detail", {
      locale: "tr", conversationId: conversationId || "paira", token,
    });
  }
  // 2) Classic payment retrieve by paymentId.
  let byPayment = null;
  if (paymentId) {
    byPayment = await iyzicoRequest(env, "POST", "/payment/detail", {
      locale: "tr", conversationId: conversationId || "paira", paymentId,
    });
  }
  // 3) Reporting service (status, refund state, card).
  let report = null;
  if (paymentId) {
    const q = `/v2/reporting/payment/details?paymentId=${encodeURIComponent(paymentId)}`;
    report = await iyzicoRequest(env, "GET", q, null);
  }

  const src = (byToken && byToken.status === "success") ? byToken
            : (byPayment && byPayment.status === "success") ? byPayment : null;
  const rep = report && report.status === "success" && Array.isArray(report.payments) ? report.payments[0] : null;

  const paidPrice = src ? src.paidPrice : (rep ? rep.paidPrice : null);
  const product = pickProduct(paidPrice);

  // Buyer fields: iyzico does not document these on retrieve responses; we
  // pass through whatever is present so the first live test shows what we get.
  const buyer = (src && (src.buyer || src.buyerInfo)) || null;
  const billing = (src && (src.billingAddress || src.billing)) || null;

  return json({
    ok: !!(src || rep),
    paymentId: (src && src.paymentId) || (rep && rep.paymentId) || paymentId || null,
    conversationId: (src && src.conversationId) || conversationId || null,
    paymentStatus: (src && src.paymentStatus) || (rep && rep.paymentStatus) || null,
    fraudStatus: (src && src.fraudStatus) ?? (rep && rep.fraudStatus) ?? null,
    refundStatus: rep ? rep.paymentRefundStatus : null,
    price: src ? src.price : (rep ? rep.price : null),
    paidPrice,
    currency: (src && src.currency) || (rep && rep.currency) || "TRY",
    installment: (src && src.installment) || (rep && rep.installment) || 1,
    cardLastFour: (src && src.lastFourDigits) || (rep && rep.lastFourDigits) || null,
    createdDate: rep ? rep.createdDate : null,
    productCode: product.code,
    productLabel: product.label,
    buyerName: buyer ? [buyer.name, buyer.surname].filter(Boolean).join(" ") : null,
    buyerEmail: buyer ? buyer.email || null : null,
    buyerPhone: buyer ? buyer.gsmNumber || buyer.phone || null : null,
    buyerIdentity: buyer ? buyer.identityNumber || null : null,
    billingName: billing ? billing.contactName || null : null,
    billingAddress: billing ? [billing.address, billing.city, billing.country].filter(Boolean).join(", ") : null,
    // Raw responses, useful for the first live test; remove later if noisy.
    raw: { byToken, byPayment, report },
  });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ ok: false, error: "method not allowed" }, 405);
}
