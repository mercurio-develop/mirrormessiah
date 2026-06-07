import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Simple LRU-style cache for verified tokens to avoid blocking the event loop
// with expensive crypto on every asset/subtitle request.
const verifiedTokens = new Map<string, { expires: number }>();
const MAX_CACHE_SIZE = 500;

// Define the routes that don't require authentication
const publicRoutes = ['/login', '/api/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow access to public routes and static assets
  if (
    publicRoutes.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/posters') ||
    pathname === '/favicon.ico' ||
    pathname === '/placeholder.svg'
  ) {
    return NextResponse.next();
  }

  const gateKey = (process.env.GATE_KEY || '').trim();
  const tokenCookie = request.cookies.get('mm_gate_token')?.value;
  const tokenQuery = request.nextUrl.searchParams.get('t');
  const token = tokenCookie || tokenQuery;

  // If no token or no gate key is configured, redirect to login
  if (!token || !gateKey) {
    // If it's an API route, return 401 Unauthorized
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    // For pages, redirect to the login screen
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // Check cache first (valid for 60 seconds)
    const cached = verifiedTokens.get(token);
    if (cached && cached.expires > Date.now()) {
        return NextResponse.next();
    }

    // Verify the JWT token
    const SECRET_KEY = new TextEncoder().encode(gateKey);
    await jwtVerify(token, SECRET_KEY);

    // Cache successful verification
    // Implement aggressive cleanup if Map grows too large
    if (verifiedTokens.size >= MAX_CACHE_SIZE) {
        // Simple strategy: Clear everything if limit reached to prevent RangeError
        // This is safe because it just triggers one crypto verify per active user
        verifiedTokens.clear();
    }
    
    verifiedTokens.set(token, { expires: Date.now() + 60000 });

    return NextResponse.next();
  } catch (error) {
    // Token is invalid or expired
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    // Delete the invalid cookie and redirect to login
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('mm_gate_token');
    return response;
  }
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
