import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export default async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. Essential public routes (ONLY what is needed for the login screen)
  if (
    path === '/login' ||
    path === '/api/auth' || 
    path.startsWith('/_next') ||
    path === '/favicon.ico' ||
    path === '/placeholder.svg'
  ) {
    return NextResponse.next();
  }

  // 2. Check for the Gate Token (General App Entry)
  const token = request.cookies.get('mm_gate_token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const gateKey = process.env.GATE_KEY;

    if (!gateKey) {
        console.error('CRITICAL: GATE_KEY not configured in environment.');
        return NextResponse.redirect(new URL('/login', request.url));
    }
    
    const SECRET_KEY = new TextEncoder().encode(gateKey);
    await jwtVerify(token, SECRET_KEY);

    // 3. Restrict Admin routes to Local Development
    if (path.startsWith('/admin') && process.env.NODE_ENV === 'production') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
  } catch (error) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('mm_gate_token');
    response.cookies.delete('mm_admin_token');
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!api/auth|login|_next/static|_next/image|favicon.ico|placeholder.svg).*)',
  ],
};
