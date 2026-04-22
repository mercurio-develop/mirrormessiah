import { jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';

export class AuthError extends Error {
  constructor(message: string, public status: number = 401) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Validates the admin status for Server Actions
 */
export async function requireAdminKeyAuth(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new AuthError('Administrative tools are restricted to local development only', 403);
  }

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    throw new AuthError('Admin key not configured on server', 500);
  }

  // 1. Check Header (Direct CLI/API access)
  const headersList = await headers();
  const providedKey = headersList.get('x-admin-key');
  if (providedKey === adminKey) return;

  // 2. Check Cookie
  const cookieStore = await cookies();
  const token = cookieStore.get('mm_admin_token')?.value;

  if (token) {
    try {
      const SECRET_KEY = new TextEncoder().encode(adminKey);
      await jwtVerify(token, SECRET_KEY);
      return; 
    } catch (e) {}
  }

  throw new AuthError('Unauthorized access', 401);
}

/**
 * Validates the admin status of a request
 * Checks for either x-admin-key header OR a valid JWT token in cookies
 * IMPORTANT: Admin features are restricted to development mode only.
 */
export async function requireAdminKey(request: Request): Promise<void> {
  // 0. Build Phase & Environment Safeguard
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
  const isAdminKeySet = !!process.env.ADMIN_KEY;

  if (isBuild && !isAdminKeySet) {
    return;
  }

  if (process.env.NODE_ENV === 'production' && !isBuild) {
    throw new AuthError('Administrative tools are restricted to local development only', 403);
  }

  const adminKey = process.env.ADMIN_KEY;

  if (!adminKey) {
    throw new AuthError('Admin key not configured on server', 500);
  }

  // 1. Check Header (Direct CLI/API access)
  const providedKey = request.headers.get('x-admin-key');
  if (providedKey === adminKey) return;

  // 2. Check Cookie (Specifically for mm_admin_token)
  const cookie = request.headers.get('cookie');
  if (cookie) {
    const tokenMatch = cookie.match(/mm_admin_token=([^;]+)/);
    if (tokenMatch) {
      try {
        const SECRET_KEY = new TextEncoder().encode(adminKey);
        await jwtVerify(tokenMatch[1], SECRET_KEY);
        return; // Valid session
      } catch (e) {
        // Fall through to error
      }
    }
  }

  throw new AuthError('Unauthorized access', 401);
}

/**
 * Middleware wrapper for API routes that require admin authentication
 */
export function withAdminAuth<T extends any[]>(
  handler: (request: Request, ...args: T) => Promise<Response>
) {
  return async (request: Request, ...args: T): Promise<Response> => {
    try {
      await requireAdminKey(request);
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof AuthError) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { 
            status: error.status,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      return new Response(
        JSON.stringify({ error: 'Internal Server Error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}

/**
 * Validates that the user has at least general app access (GATE_KEY)
 */
export async function requireGateKey(request: Request): Promise<void> {
  // 0. Build Phase Safeguard
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
  const isGateKeySet = !!process.env.GATE_KEY;

  if (isBuild && !isGateKeySet) {
    return;
  }

  const gateKey = process.env.GATE_KEY;

  if (!gateKey) {
    throw new AuthError('Gate key not configured on server', 500);
  }

  const cookie = request.headers.get('cookie');
  if (cookie) {
    const tokenMatch = cookie.match(/mm_gate_token=([^;]+)/);
    if (tokenMatch) {
      try {
        const SECRET_KEY = new TextEncoder().encode(gateKey);
        await jwtVerify(tokenMatch[1], SECRET_KEY);
        return; // Valid session
      } catch (e) {
        // Fall through to error
      }
    }
  }

  throw new AuthError('Access denied: Authentication required', 401);
}

export function isAdminKeyConfigured(): boolean {
  return !!process.env.ADMIN_KEY;
}
