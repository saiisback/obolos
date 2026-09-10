import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.OBOLOS_BUILD_DIR || '.next',
  turbopack: { root: process.cwd() },
  async rewrites() {
    return { beforeFiles: [{ source: '/', destination: '/landing/index.html' }] };
  },
};
export default config;
