import type { ApiMap, ServiceConfig } from '../../shared/api.ts';
import { AppError, ERR } from '../../shared/errors.ts';
import type { Ctx } from '../context.ts';
import { PROP } from '../platform.ts';
import { requireService } from '../services/auth.ts';

const CONFIG_PROPS: Record<keyof ServiceConfig, string> = {
  serviceToken: PROP.SERVICE_TOKEN,
  vapidPublicKey: PROP.VAPID_PUBLIC_KEY,
  githubRepo: PROP.GITHUB_REPO,
  githubDispatchToken: PROP.GITHUB_DISPATCH_TOKEN,
};

/**
 * Sets Script Properties from the local configure script. The very first call (no service token yet)
 * must set one; every later call must present the current token.
 */
export function svcConfigure(ctx: Ctx, token: unknown, req: ApiMap['svcConfigure']['req']): ApiMap['svcConfigure']['res'] {
  const config = req.config ?? {};
  if (ctx.p.props.get(PROP.SERVICE_TOKEN)) requireService(ctx, token);
  else if (typeof config.serviceToken !== 'string' || config.serviceToken.length < 32) {
    throw new AppError(ERR.BAD_REQUEST, 'First configuration must set a serviceToken of 32+ characters');
  }
  if (config.serviceToken !== undefined && config.serviceToken.length < 32) {
    throw new AppError(ERR.BAD_REQUEST, 'serviceToken must be 32+ characters');
  }
  const configured: string[] = [];
  for (const [key, prop] of Object.entries(CONFIG_PROPS) as [keyof ServiceConfig, string][]) {
    const value = config[key];
    if (typeof value !== 'string') continue;
    ctx.p.props.set(prop, value.trim());
    configured.push(key);
  }
  return { configured };
}
