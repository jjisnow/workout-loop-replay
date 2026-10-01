import type { CapacitorConfig } from '@capacitor/cli';

// Bundle dist by default. Live reload is opt-in and does not affect Lovable web builds.
const serverUrl = process.env.CAPACITOR_SERVER_URL;
let server: CapacitorConfig['server'];
if (serverUrl) {
  const url = new URL(serverUrl);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) throw new Error('CAPACITOR_SERVER_URL must use HTTPS (or localhost HTTP)');
  server = { url: serverUrl, cleartext: localHttp };
}

const config: CapacitorConfig = {
  appId: 'app.lovable.fb546a84b9ba4b64a54c8b95ea6d08f5',
  appName: 'Workout Loop Replay',
  webDir: 'dist',
  ...(server ? { server } : {}),
};

export default config;
