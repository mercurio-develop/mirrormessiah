import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect administrative API routes
  if (pathname.startsWith('/api/admin')) {
    const adminKey = (process.env.ADMIN_KEY || '').trim();
    const token = request.cookies.get('mm_admin_token')?.value;
    const headerKey = request.headers.get('x-admin-key');

    if (adminKey && headerKey === adminKey) {
      return NextResponse.next();
    }

    if (!token || !adminKey) {
      return NextResponse.json({ error: 'Administrative authentication required' }, { status: 401 });
    }

    try {
      const SECRET_KEY = new TextEncoder().encode(adminKey);
      await jwtVerify(token, SECRET_KEY);
      return NextResponse.next();
    } catch {
      return NextResponse.json({ error: 'Administrative authentication required' }, { status: 401 });
    }
  }

  // All other pages, APIs, media streaming, and assets are accessible without gate login
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
