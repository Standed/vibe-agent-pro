import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    optimizePackageImports: ['lucide-react'],
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/n8n-bucket-xys/**',
      },
    ],
  },
  webpack: (config) => {
    config.externals.push({
      'fluent-ffmpeg': 'commonjs fluent-ffmpeg'
    });
    return config;
  },
  async redirects() {
    return [
      {
        source: '/project/:id/planning',
        destination: '/project/:id?view=planning',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
