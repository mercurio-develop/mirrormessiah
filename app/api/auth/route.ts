import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

export async function GET(request: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return NextResponse.json({ isAdmin: false });

  const cookie = request.cookies.get('mirrormessiah_token');
  if (!cookie) return NextResponse.json({ isAdmin: false });

  try {
    const SECRET_KEY = new TextEncoder().encode(adminKey);
    await jwtVerify(cookie.value, SECRET_KEY);
    return NextResponse.json({ isAdmin: true });
  } catch (e) {
    return NextResponse.json({ isAdmin: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const currentAdminKey = (process.env.ADMIN_KEY || "").trim();

    if (!currentAdminKey) {
        console.error('CRITICAL: ADMIN_KEY not configured in environment.');
        return NextResponse.json({ error: 'System configuration error' }, { status: 500 });
    }

    if (password.trim() === currentAdminKey) {
      const SECRET_KEY = new TextEncoder().encode(currentAdminKey);
      const token = await new SignJWT({ authorized: true })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(SECRET_KEY);

      const response = NextResponse.json({ success: true });
      response.cookies.set('mirrormessiah_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });

      return response;
    }

    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  } catch (error) {
    console.error('Auth failure:', error);
    return NextResponse.json({ error: 'Auth failed' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('mirrormessiah_token', '', {
    httpOnly: true,
    maxAge: 0,
  });
  return response;
}
