import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.fb546a84b9ba4b64a54c8b95ea6d08f5',
  appName: 'A Lovable project',
  webDir: 'dist',
  server: {
    url: 'https://fb546a84-b9ba-4b64-a54c-8b95ea6d08f5.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    Camera: {
      permissions: ['camera']
    }
  }
};

export default config;