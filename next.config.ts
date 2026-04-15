import type { NextConfig } from "next";

const envAllowedOrigins = (process.env.ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.0.102",
    "10.115.12.170",
    ...envAllowedOrigins,
  ],
};

export default nextConfig;
