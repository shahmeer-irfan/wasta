/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disabled because StrictMode's intentional double-mount in dev tears down
  // and immediately recreates the WebRTC + Supabase Realtime channels, which
  // breaks the voice handshake: the first VoiceChannel.cleanup() calls
  // supabase.removeChannel() for topic `voice-{incidentId}`, and Realtime
  // tracks topic subscriptions per-client — so the freshly mounted second
  // VoiceChannel sees its own subscription get CLOSED right after SUBSCRIBED.
  // Production builds don't double-mount, so this is dev-only protection.
  reactStrictMode: false,
};

export default nextConfig;
