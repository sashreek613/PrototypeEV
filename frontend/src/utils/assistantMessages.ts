/** Mirror of backend/app/services/lyzr_service.py NOT_CONFIGURED_MESSAGE.
 * Used in the frontend to detect the "not configured" case and render
 * an italicised muted message rather than the normal assistant bubble style.
 * Do NOT import secrets here -- this is only the human-readable string. */
export const NOT_CONFIGURED_MESSAGE =
  "The site assistant isn't configured yet -- ask an admin to set LYZR_API_KEY and LYZR_AGENT_ID.";
