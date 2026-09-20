/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Tree-shake icon imports so each page ships only the icons it uses
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'localhost',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=()',
          },
          {
            // Report-only first so violations surface in the console without
            // breaking the app; enforce later once clean. 'unsafe-inline'/
            // 'unsafe-eval' are required by the Next.js runtime.
            key: 'Content-Security-Policy-Report-Only',
            value:
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob:; " +
              "connect-src 'self' https://nominatim.openstreetmap.org; " +
              "font-src 'self' data:; " +
              "media-src 'self' blob:; " +
              "frame-ancestors 'none'; " +
              "base-uri 'self'; " +
              "form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
