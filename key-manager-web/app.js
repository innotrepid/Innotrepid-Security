const config = window.KEY_MANAGER_CONFIG ?? {};
const $ = (id) => document.getElementById(id);
let idToken = null;
let selectedBusinessId = null;
let currentOperator = null;

const setHidden = (id, hidden) => $(id).classList.toggle("hidden", hidden);
const showFeedback = (message, isError = false) => {
  $("feedback").textContent = message;
  $("feedback").classList.toggle("error", isError);
  setHidden("feedback", false);
};
const clearFeedback = () => setHidden("feedback", true);

function setAuthenticated(token, email) {
  idToken = token;
  currentOperator = email || "Authorized operator";
  $("operator-label").textContent = currentOperator;
  $("sign-in").classList.add("hidden");
  $("sign-out").classList.remove("hidden");
  $("submit-action").disabled = false;
  $("submit-action").textContent = "Run operation";
  setHidden("auth-notice", true);
}

function signOut() {
  idToken = null;
  currentOperator = null;
  $("operator-label").textContent = "Not signed in";
  $("sign-in").classList.remove("hidden");
  $("sign-out").classList.add("hidden");
  $("submit-action").disabled = true;
  $("submit-action").textContent = "Sign in to continue";
  setHidden("auth-notice", false);
}

function base64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomUrlSafe(length = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(length)));
}
async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
function decodeJwtPayload(token) {
  const part = token.split(".")[1];
  if (!part) throw new Error("Google returned an invalid identity token.");
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
}

async function beginGoogleSignIn() {
  if (!config.googleClientId) throw new Error("Google OAuth client ID is not configured in key-manager-web/config.js.");
  if (!window.isSecureContext) throw new Error("Google sign-in requires HTTPS (localhost is allowed for development).");
  const state = randomUrlSafe();
  const nonce = randomUrlSafe();
  const verifier = randomUrlSafe(48);
  sessionStorage.setItem("km_oauth_state", state);
  sessionStorage.setItem("km_oauth_nonce", nonce);
  sessionStorage.setItem("km_oauth_verifier", verifier);
  const challenge = base64Url(await sha256(verifier));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.redirectUri || location.href.split("?")[0],
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account"
  }).toString();
  location.assign(url.toString());
}

async function completeGoogleSignIn() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return;
  const state = params.get("state");
  const expectedState = sessionStorage.getItem("km_oauth_state");
  const verifier = sessionStorage.getItem("km_oauth_verifier");
  const expectedNonce = sessionStorage.getItem("km_oauth_nonce");
  sessionStorage.removeItem("km_oauth_state");
  sessionStorage.removeItem("km_oauth_verifier");
  sessionStorage.removeItem("km_oauth_nonce");
  history.replaceState({}, document.title, location.pathname);
  if (!state || !expectedState || state !== expectedState || !verifier || !expectedNonce) {
    throw new Error("Google sign-in could not be validated. Please try again.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      redirect_uri: config.redirectUri || location.href.split("?")[0],
      grant_type: "authorization_code",
      code_verifier: verifier
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.id_token) throw new Error("Google sign-in failed. Check the OAuth client and redirect URI.");
  const claims = decodeJwtPayload(payload.id_token);
  if (claims.nonce !== expectedNonce || !claims.email_verified) {
    throw new Error("Google identity response did not pass the expected checks.");
  }
  // The API independently verifies signature, issuer, audience, expiry and operator allowlist.
  setAuthenticated(payload.id_token, claims.email);
}

async function api(path, options = {}) {
  if (!idToken) throw new Error("Sign in with an authorized operator account first.");
  const base = (config.apiBaseUrl || "/v1/key-manager").replace(/\/$/, "");
  const response = await fetch(base + path, {
    ...options,
    cache: "no-store",
    headers: {
      authorization: "Bearer " + idToken,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error === "operator_not_allowed"
      ? "This Google account is not on the Key Manager operator allowlist."
      : data.error === "permission_denied"
        ? "Your operator role does not permit this action."
        : data.error || "The request could not be completed.";
    throw new Error(message);
  }
  return data;
}

function localDateTimeWithOffset(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Choose a valid custom expiry date and time.");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0") + "T" + String(date.getHours()).padStart(2, "0") + ":" +
    String(date.getMinutes()).padStart(2, "0") + ":" + String(date.getSeconds()).padStart(2, "0") +
    sign + hours + ":" + minutes;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
function renderHistory(data) {
  const licenses = data.licenses || [];
  const events = data.auditEvents || [];
  $("history-content").innerHTML = licenses.length
    ? licenses.map((item) => {
        const claims = item.claims || {};
        return `<div class="history-item">
          <div class="history-top"><strong>${escapeHtml(item.licenseId)}</strong><span class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></div>
          <div class="history-grid"><span>Expires</span><strong>${escapeHtml(claims.expiresAt || "—")}</strong><span>Grace</span><strong>${escapeHtml(claims.graceDays ?? 0)} days</strong><span>Devices</span><strong>${claims.maxDevices == null ? "Unlimited" : escapeHtml(claims.maxDevices)}</strong></div>
        </div>`;
      }).join("")
    : '<p class="empty">No licence records found for this business.</p>';
  if (events.length) {
    $("history-content").insertAdjacentHTML("beforeend",
      '<h3 class="audit-heading">Recent audit events</h3>' + events.map((event) =>
        `<div class="audit-row"><strong>${escapeHtml(event.action)}</strong><span>${escapeHtml(event.actorId)}</span><time>${escapeHtml(event.createdAt || event.at || "")}</time></div>`
      ).join(""));
  }
  setHidden("history-panel", false);
  $("business-summary").innerHTML = `<span class="summary-label">Selected business</span><strong>${escapeHtml(data.businessId)}</strong>`;
  setHidden("business-summary", false);
}

async function loadHistory(businessId) {
  const data = await api("/businesses/" + encodeURIComponent(businessId) + "/history");
  selectedBusinessId = businessId;
  renderHistory(data);
}

function updateActionFields() {
  const action = $("action").value;
  const isTermAction = action === "issue" || action === "renew";
  setHidden("term-fields", !isTermAction);
  setHidden("reason-field", action !== "replace" && action !== "revoke");
  $("submit-action").textContent = idToken ? (action === "revoke" ? "Revoke licence" : action === "replace" ? "Replace licence" : action === "renew" ? "Renew licence" : "Issue licence") : "Sign in to continue";
  $("submit-action").classList.toggle("danger", action === "revoke");
}
function updateTermFields() {
  setHidden("custom-fields", $("term").value !== "custom");
}

async function submitAction(event) {
  event.preventDefault();
  clearFeedback();
  if (!selectedBusinessId) throw new Error("Find and select a business before managing its licence.");
  const action = $("action").value;
  const body = { businessId: selectedBusinessId };
  if (action === "issue" || action === "renew") {
    const kind = $("term").value;
    body.term = kind === "custom"
      ? { kind: "custom", expiresAt: localDateTimeWithOffset($("expires-at").value) }
      : kind === "monthly" ? { kind: "monthly", timeZone: "Africa/Nairobi" } : { kind: "weekly" };
    body.graceDays = Number($("grace-days").value);
    const maxDevices = $("max-devices").value.trim();
    body.maxDevices = maxDevices ? Number(maxDevices) : null;
    if (!Number.isInteger(body.graceDays) || body.graceDays < 0 || body.graceDays > 365) throw new Error("Grace days must be between 0 and 365.");
    if (body.maxDevices !== null && (!Number.isInteger(body.maxDevices) || body.maxDevices < 1 || body.maxDevices > 10000)) throw new Error("Maximum devices must be between 1 and 10,000, or blank for unlimited.");
  } else {
    body.reason = $("reason").value.trim();
    if (!body.reason) throw new Error("A reason is required for replacement or revocation.");
  }
  const labels = { issue: "Issue licence", renew: "Renew licence", replace: "Replace licence", revoke: "Revoke licence" };
  if (!confirm(labels[action] + " for business " + selectedBusinessId + "?")) return;
  const result = await api("/licenses/" + action, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body)
  });
  $("result-title").textContent = action === "revoke" ? "Licence revoked" : "Activation code";
  $("result-message").textContent = action === "revoke"
    ? "The licence was revoked. No activation code is returned for revocation."
    : "The operation completed. Deliver this signed activation code securely to the customer.";
  $("activation-token").value = result.activationToken || "";
  $("copy-token").disabled = !result.activationToken;
  setHidden("result-panel", false);
  await loadHistory(selectedBusinessId);
  showFeedback(labels[action] + " completed.");
}

$("sign-in").addEventListener("click", () => beginGoogleSignIn().catch((error) => showFeedback(error.message, true)));
$("sign-out").addEventListener("click", signOut);
$("lookup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFeedback();
  try { await loadHistory($("business-id").value.trim()); }
  catch (error) { showFeedback(error.message, true); }
});
$("action").addEventListener("change", updateActionFields);
$("term").addEventListener("change", updateTermFields);
$("action-form").addEventListener("submit", (event) => submitAction(event).catch((error) => showFeedback(error.message, true)));
$("copy-token").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("activation-token").value);
    $("copy-status").textContent = "Copied";
  } catch { $("copy-status").textContent = "Clipboard unavailable; select and copy manually."; }
});

updateActionFields();
updateTermFields();
completeGoogleSignIn().catch((error) => showFeedback(error.message, true));
