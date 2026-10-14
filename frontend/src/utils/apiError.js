/**
 * Turn a failed API call into a readable, status-aware message.
 *
 * Server-provided text wins where it is meaningful (400/403/404/409/422), but
 * gateway-style failures (HTML bodies from nginx/load balancers, 5xx) and
 * network failures get fixed wording so users never see raw axios messages.
 */

/** Size shown to users when an upload is rejected as too large (413). */
export const MAX_FILE_SIZE_LABEL = "100 MB";

export const FILE_TOO_LARGE_MESSAGE = `The upload was rejected because it is too large. Each document must be ${MAX_FILE_SIZE_LABEL} or smaller. Please compress or remove larger documents and try again.`;

const FALLBACKS = {
  400: "The request was not valid. Please review the form and try again.",
  401: "Your session has expired. Please sign in again and resubmit.",
  403: "You do not have permission to create this request.",
  404: "The service could not be found. Please refresh the page and try again.",
  408: "The request timed out. Please check your connection and try again.",
  409: "This request conflicts with an existing one. Please refresh and try again.",
  413: FILE_TOO_LARGE_MESSAGE,
  415: "One of the attached files has an unsupported type. Please check your attachments.",
  422: "Some fields are invalid. Please review the form and try again.",
  429: "Too many attempts. Please wait a moment and try again.",
  500: "Something went wrong on the server. Please try again shortly.",
  502: "The server is temporarily unreachable. Please try again in a moment.",
  503: "The service is temporarily unavailable. Please try again in a moment.",
  504: "The server took too long to respond. Your request may not have been saved — check My Requests before retrying.",
};

/** FastAPI `detail` is a string, or a list of { loc, msg } validation entries. */
const readDetail = (detail) => {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => {
        if (typeof d === "string") return d;
        const field = Array.isArray(d?.loc) ? d.loc.filter((p) => p !== "body").join(".") : "";
        return d?.msg ? (field ? `${field}: ${d.msg}` : d.msg) : null;
      })
      .filter(Boolean);
    return parts.length ? parts.join("; ") : null;
  }
  return null;
};

const readServerMessage = (data) => {
  // HTML (proxy error page) or empty bodies carry nothing worth showing.
  if (!data || typeof data !== "object") return null;
  const message = data.message || data.error || readDetail(data.detail);
  return typeof message === "string" && message.trim() ? message : null;
};

export const getApiErrorMessage = (error, fallback = "Failed to create request") => {
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") return FALLBACKS[408];

  const status = error?.response?.status;
  if (!status) {
    return "Could not reach the server. Please check your internet connection and try again.";
  }

  const serverMessage = readServerMessage(error.response.data);
  // Server-side 5xx text is usually internal; show friendly wording instead.
  if (serverMessage && status < 500 && status !== 413) return serverMessage;

  if (FALLBACKS[status]) return FALLBACKS[status];
  if (status >= 500) return FALLBACKS[500];
  return serverMessage || fallback;
};
