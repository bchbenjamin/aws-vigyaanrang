import type { NextConfig } from "next";

const envAllowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const appBaseUrl = (process.env.APP_BASE_URL || "").trim();
const appBaseOrigin = appBaseUrl
  ? appBaseUrl.replace(/\/$/, "")
  : "";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...envAllowedOrigins,
    ...(appBaseOrigin ? [appBaseOrigin] : []),
  ],
};

export default nextConfig;
