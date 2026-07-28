/** @type {import('next').NextConfig} */
const nextConfig = {
  // LAN IPs allowed to load the dev server (`next dev`) from another device.
  // Add whatever IP you open the app from (e.g. shown as the "Network:" URL
  // when `npm run dev` starts). Only affects dev mode — `npm run start`
  // (production) has no such restriction.
  allowedDevOrigins: ["192.168.1.12"],
};

export default nextConfig;
