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
    serverActions: {
      bodySizeLimit: '2gb'
    }
  },
  httpAgentOptions: {
    keepAlive: true,
  },
  serverRuntimeConfig: {
    maxBodySize: '2gb',
    api: {
      bodyParser: {
        sizeLimit: '2gb'
      },
      responseLimit: '2gb'
    }
  },
  outputFileTracing: true,
  rewrites: async () => {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
    ]
  }
}

module.exports = nextConfig