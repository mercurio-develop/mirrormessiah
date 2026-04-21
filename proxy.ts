import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (
    path === '/login' ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/images') ||
    path.startsWith('/_next') ||
    path === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('mirrormessiah_token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const currentAdminKey = process.env.ADMIN_KEY;
    if (!currentAdminKey) {
        console.error('CRITICAL: ADMIN_KEY not configured in environment.');
        return NextResponse.redirect(new URL('/login', request.url));
    }
    
    const SECRET_KEY = new TextEncoder().encode(currentAdminKey);
    await jwtVerify(token, SECRET_KEY);
    return NextResponse.next();
  } catch (error) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('mirrormessiah_token');
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)',
  ],
};
