import type { NextConfig } from "next";

const customDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(',').map((s) => s.trim())
  : [];

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: { proxyClientMaxBodySize: '100mb', proxyTimeout: 600_000 },
  allowedDevOrigins: [
    '*.ngrok-free.dev',
    '*.ngrok-free.app',
    '*.ngrok.app',
    '*.ngrok.io',
    'localhost:3000',
    '127.0.0.1:3000',
    'larcher-brecken-palynologically.ngrok-free.dev',
    ...customDevOrigins,
  ],
  async rewrites() {
    const backendUrl = process.env.INTERNAL_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
