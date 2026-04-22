import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

/**
 * GET /api/auth
 * Specifically checks for administrative authorization.
 * Restricted to Local Development.
 */
export async function GET(request: NextRequest) {
  // 1. Restrict Admin Mode to Development Only
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ isAdmin: false });
  }

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return NextResponse.json({ isAdmin: false });

  // Specifically check for the Admin Token
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
    const gateKey = (process.env.GATE_KEY || "").trim();
    const adminKey = (process.env.ADMIN_KEY || "").trim();

    if (!gateKey) {
        console.error('CRITICAL: GATE_KEY not configured in environment.');
        return NextResponse.json({ error: 'System configuration error' }, { status: 500 });
    }

    const response = NextResponse.json({ success: true });

    // 1. Check for Admin Key
    if (adminKey && password.trim() === adminKey) {
      const ADMIN_SECRET = new TextEncoder().encode(adminKey);
      const GATE_SECRET = new TextEncoder().encode(gateKey);

      // Create Admin Token
      const adminToken = await new SignJWT({ authorized: true, role: 'admin' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1d')
        .sign(ADMIN_SECRET);

      // Create Gate Token (so they don't have to login twice)
      const gateToken = await new SignJWT({ authorized: true })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(GATE_SECRET);

      response.cookies.set('mm_admin_token', adminToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
      });

      response.cookies.set('mm_gate_token', gateToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });

      return response;
    }

    // 2. Check for Gate Key
    if (password.trim() === gateKey) {
      const GATE_SECRET = new TextEncoder().encode(gateKey);
      
      const gateToken = await new SignJWT({ authorized: true })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(GATE_SECRET);

      response.cookies.set('mm_gate_token', gateToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
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
