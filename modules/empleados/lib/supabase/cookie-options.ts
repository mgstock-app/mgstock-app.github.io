// The browser SDK reads/refreshes the session, so HttpOnly is not compatible
// with this architecture. Production is served over HTTPS; local dev uses HTTP.
export const authCookieOptions = {
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
