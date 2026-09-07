import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, turbopack: { root: process.cwd() } };
export default config;
