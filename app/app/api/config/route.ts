import { env } from 'cloudflare:workers';
import { localEmulator, type Settings } from '@/server/auth';
export function GET(request: Request) {
  const settings = env as unknown as Settings;
  const emulator = localEmulator(request, settings, import.meta.env.DEV);
  return Response.json(
    {
      configured: !!(
        settings.FIREBASE_API_KEY &&
        settings.FIREBASE_PROJECT_ID &&
        settings.FIREBASE_AUTH_DOMAIN
      ),
      emulator,
      firebase: {
        apiKey: settings.FIREBASE_API_KEY,
        projectId: settings.FIREBASE_PROJECT_ID,
        authDomain: settings.FIREBASE_AUTH_DOMAIN,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
