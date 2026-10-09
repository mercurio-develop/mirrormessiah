import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

// Browsers drop Secure cookies on plain HTTP, so LAN deployments without TLS set COOKIE_SECURE=false.
const SECURE_COOKIES =
  process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false';

/**
 * GET /api/auth
 * Checks for administrative authorization.
 */
export async function GET(request: NextRequest) {
  const adminKey = (process.env.ADMIN_KEY || '').trim();
  if (!adminKey) return NextResponse.json({ isAdmin: false });

  // 1. Check header
  const headerKey = request.headers.get('x-admin-key');
  if (headerKey && headerKey === adminKey) {
    return NextResponse.json({ isAdmin: true });
  }

  // 2. Check for the Admin Token cookie
  const cookie = request.cookies.get('mm_admin_token');
  if (!cookie) return NextResponse.json({ isAdmin: false });

  try {
    const SECRET_KEY = new TextEncoder().encode(adminKey);
    await jwtVerify(cookie.value, SECRET_KEY);
    return NextResponse.json({ isAdmin: true });
  } catch (e) {
    return NextResponse.json({ isAdmin: false });
  }
}

/**
 * POST /api/auth
 * Handles authentication for both GATE_KEY (app entry) and ADMIN_KEY (management)
 */
export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const gateKey = (process.env.GATE_KEY || '').trim();
    const adminKey = (process.env.ADMIN_KEY || '').trim();

    if (!adminKey && !gateKey) {
      console.error('CRITICAL: Neither ADMIN_KEY nor GATE_KEY configured.');
      return NextResponse.json({ error: 'System configuration error' }, { status: 500 });
    }

    const response = NextResponse.json({ success: true });

    // 1. Check for Admin Key
    if (adminKey && password.trim() === adminKey) {
      const ADMIN_SECRET = new TextEncoder().encode(adminKey);

      // Create Admin Token
      const adminToken = await new SignJWT({ authorized: true, role: 'admin' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1d')
        .sign(ADMIN_SECRET);

      response.cookies.set('mm_admin_token', adminToken, {
        httpOnly: true,
        secure: SECURE_COOKIES,
        sameSite: 'strict',
        maxAge: 60 * 60 * 24,
      });

      if (gateKey) {
        const GATE_SECRET = new TextEncoder().encode(gateKey);
        const gateToken = await new SignJWT({ authorized: true })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime('30d')
          .sign(GATE_SECRET);

        response.cookies.set('mm_gate_token', gateToken, {
          httpOnly: true,
          secure: SECURE_COOKIES,
          sameSite: 'strict',
          maxAge: 60 * 60 * 24 * 30,
        });
      }

      return response;
    }

    // 2. Check for Gate Key
    if (gateKey && password.trim() === gateKey) {
      const GATE_SECRET = new TextEncoder().encode(gateKey);
      
      const gateToken = await new SignJWT({ authorized: true })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(GATE_SECRET);

      response.cookies.set('mm_gate_token', gateToken, {
        httpOnly: true,
        secure: SECURE_COOKIES,
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 30,
      });

      return response;
    }

    return NextResponse.json({ error: 'Invalid access key' }, { status: 401 });
  } catch (error) {
    console.error('Auth failure:', error);
    return NextResponse.json({ error: 'Auth failed' }, { status: 500 });
  }
}

/**
 * DELETE /api/auth
 * session termination
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const adminOnly = searchParams.get('mode') === 'admin';

  const response = NextResponse.json({ success: true });
  
  if (adminOnly) {
    response.cookies.set('mm_admin_token', '', { httpOnly: true, maxAge: 0 });
  } else {
    response.cookies.set('mm_gate_token', '', { httpOnly: true, maxAge: 0 });
    response.cookies.set('mm_admin_token', '', { httpOnly: true, maxAge: 0 });
  }
  
  return response;
}
