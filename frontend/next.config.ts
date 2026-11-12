import type { NextConfig } from 'next';

// Khi chạy dev/demo không có nginx phía trước, BACKEND_ORIGIN (vd http://127.0.0.1:8000) cho phép
// Next chuyển tiếp /api/v1 và /ws sang FastAPI cùng origin — cookie phiên & CSRF hoạt động như production.
const backendOrigin = process.env.BACKEND_ORIGIN;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!backendOrigin) return [];
    return [
      { source: '/api/v1/:path*', destination: `${backendOrigin}/api/v1/:path*` },
      { source: '/ws/:path*', destination: `${backendOrigin}/ws/:path*` },
    ];
  },
};

export default nextConfig;
