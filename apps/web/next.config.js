/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode catches subtle React bugs during development
  reactStrictMode: true,

  // Instrumentation hook (required for platform bootstrap)
  experimental: {
    instrumentationHook: true,
  },

  // Security headers applied to all routes
  // (The middleware adds per-request CORS/security headers;
  //  these cover non-API routes like pages and static assets.)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options',        value: 'DENY' },
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },

  // Redirect bare /api/auth/verify-email to GET handler
  // (Next.js handles this natively; no redirect needed)

  // Webpack — suppress punycode deprecation warning from transitive deps
  webpack(config) {
    config.resolve.fallback = { ...config.resolve.fallback, punycode: false }
    return config
  },
}

module.exports = nextConfig
