/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /* Next 16 blocks cross-origin access to dev resources (HMR socket,
     /__nextjs_* helpers) by default. The Freebuff preview proxies the dev
     server through an isolated *.daytonaproxy01.net host — without this
     allow-list the browser can never finish hydrating: every route sticks
     on the loading splash with zero interactivity (and zero toasts). */
  allowedDevOrigins: ["localhost", "127.0.0.1", "*.daytonaproxy01.net"],
  env: {
    /* baked at build time — surf the live value via <html data-build> to
       instantly spot a stale tab running old JavaScript */
    EXOTIC_BUILD: new Date().toISOString().replace("T", " ").slice(0, 19),
  },
};

export default nextConfig;
