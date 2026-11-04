// Local deployment configuration. Replace these values outside source control when needed.
window.KEY_MANAGER_CONFIG = Object.freeze({
  googleClientId: "",
  // Prefer same-origin reverse-proxy routing so the API does not need browser CORS.
  apiBaseUrl: "/v1/key-manager",
  redirectUri: window.location.origin + window.location.pathname
});