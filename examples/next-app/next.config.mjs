export default {
  reactStrictMode: true,
  // Native addons are loaded by Node, rather than placed in Turbopack's JavaScript chunks.
  serverExternalPackages: ['@napi-rs/canvas'],
};
