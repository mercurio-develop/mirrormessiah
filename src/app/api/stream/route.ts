import { NextRequest, NextResponse } from 'next/server';
import { validateFilePath, getMimeType, parseRangeHeader } from '@/lib/pathenc';
import { b64urlDecode } from '@/lib/b64url';
import { requireGateKey } from '@/lib/auth';
import fs from 'fs';
import { stat } from 'fs/promises';

export const dynamic = 'force-dynamic';

function fileToStream(filePath: string, options?: any) {
  const iterator = fs.createReadStream(filePath, options)[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(new Uint8Array(value));
        }
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    }
  });
}

/**
 * GET /api/stream
 * Streams video files with HTTP Range support (206 Partial Content)
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate
    try {
      await requireGateKey(request);
    } catch (error) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const encodedPath = searchParams.get('path');

    if (!encodedPath) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }

    let filePath: string;
    try {
      filePath = b64urlDecode(encodedPath);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid path encoding' }, { status: 400 });
    }

    const isValidPath = await validateFilePath(filePath);
    if (!isValidPath) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const stats = await stat(filePath);
    const fileSize = stats.size;
    const mimeType = getMimeType(filePath);
    
    console.log(`[Streaming] Serving ${filePath} as ${mimeType} (${fileSize} bytes)`);

    const rangeHeader = request.headers.get('range');
    const range = rangeHeader ? parseRangeHeader(rangeHeader, fileSize) : null;

    if (range) {
      const { start, end } = range;
      const contentLength = end - start + 1;
      const stream = fileToStream(filePath, { start, end });

      return new Response(stream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': contentLength.toString(),
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    } else {
      const stream = fileToStream(filePath);

      return new Response(stream as any, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': fileSize.toString(),
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }
  } catch (error) {
    console.error('Error in /api/stream:', error);
    return NextResponse.json({ error: 'Failed to stream file' }, { status: 500 });
  }
}
