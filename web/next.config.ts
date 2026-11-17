import type { NextConfig } from 'next'

const origin = process.env.KAANAM_API_ORIGIN ?? process.env.NOISE_API_ORIGIN ?? 'http://127.0.0.1:8000'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${origin}/api/:path*` },
      { source: '/docs', destination: `${origin}/docs` },
      { source: '/openapi.json', destination: `${origin}/openapi.json` },
    ]
  },
}

export default nextConfig
