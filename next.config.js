/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        stream: false,
        path: false,
      }
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: 'upgrade-insecure-requests'
          },
        ],
      },
    ]
  },
  experimental: {
    serverComponentsExternalPackages: ['python-shell'],
  },
  httpAgentOptions: {
    keepAlive: true,
  },
  serverRuntimeConfig: {
    maxBodySize: '500mb',
  },
  outputFileTracing: true,
  rewrites: async () => {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
    ]
  },
}

module.exports = nextConfig 