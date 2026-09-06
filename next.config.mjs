/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    /* baked at build time — surf the live value via <html data-build> to
       instantly spot a stale tab running old JavaScript */
    EXOTIC_BUILD: new Date().toISOString().replace("T", " ").slice(0, 19),
  },
};

export default nextConfig;
