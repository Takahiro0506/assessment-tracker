import { env } from 'cloudflare:workers';
import { handleWorkspace } from '@/server/workspace-api';
import type { Settings } from '@/server/auth';
export const GET = (request: Request) =>
  handleWorkspace(request, env as unknown as Settings, import.meta.env.DEV);
export const PUT = GET;
