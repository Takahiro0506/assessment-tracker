import {
  createRemoteJWKSet,
  jwtVerify,
  decodeJwt,
  decodeProtectedHeader,
} from 'jose';
export type Settings = {
  DB: D1Database;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_API_KEY?: string;
  FIREBASE_AUTH_DOMAIN?: string;
  AUTH_EMULATOR?: string;
};
const keys = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);
export function localEmulator(
  request: Request,
  env: Settings,
  development: boolean,
) {
  return (
    development &&
    env.AUTH_EMULATOR === 'true' &&
    env.FIREBASE_PROJECT_ID === 'demo-assessment-tracker' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)
  );
}
export async function authenticate(
  request: Request,
  env: Settings,
  development = false,
) {
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer (\S+)$/)?.[1];
  if (!token || !env.FIREBASE_PROJECT_ID) throw new Error('UNAUTHORIZED');
  const issuer = `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`;
  const now = Math.floor(Date.now() / 1000);
  const payload = localEmulator(request, env, development)
    ? decodeJwt(token)
    : (
        await jwtVerify(token, keys, {
          issuer,
          audience: env.FIREBASE_PROJECT_ID,
          algorithms: ['RS256'],
          requiredClaims: ['exp', 'iat', 'sub', 'auth_time'],
        })
      ).payload;
  if (
    localEmulator(request, env, development) &&
    decodeProtectedHeader(token).alg !== 'none'
  )
    throw new Error('UNAUTHORIZED');
  if (
    payload.iss !== issuer ||
    payload.aud !== env.FIREBASE_PROJECT_ID ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    payload.sub.length > 128 ||
    typeof payload.exp !== 'number' ||
    payload.exp <= now ||
    typeof payload.iat !== 'number' ||
    payload.iat > now ||
    typeof payload.auth_time !== 'number' ||
    payload.auth_time > now
  )
    throw new Error('UNAUTHORIZED');
  return payload.sub;
}
