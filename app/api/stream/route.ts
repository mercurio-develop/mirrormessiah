import { NextRequest, NextResponse } from 'next/server';
import { validateFilePath, getMimeType, parseRangeHeader } from '@/lib/pathenc';
import { b64urlDecode } from '@/lib/b64url';
import fs from 'fs';
import { stat } from 'fs/promises';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stream
 * Streams video files with HTTP Range support (206 Partial Content)
 * Query param: path = base64url-encoded absolute file path
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const encodedPath = searchParams.get('path');

    if (!encodedPath) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      );
    }

    let filePath: string;
    try {
      filePath = b64urlDecode(encodedPath);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid path encoding' },
        { status: 400 }
      );
    }

    const isValidPath = await validateFilePath(filePath);
    if (!isValidPath) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
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

      const stream = fs.createReadStream(filePath, { start, end });

      const readableStream = new ReadableStream({
        start(controller) {
          stream.on('data', (chunk) => {
            // Forward the chunk directly, as it's already a Buffer
            controller.enqueue(chunk);
          });

          stream.on('end', () => {
            controller.close();
          });

          stream.on('error', (error) => {
            console.error('Stream error:', error);
            controller.error(error);
          });
        },

        cancel() {
          stream.destroy();
        }
      });

      return new Response(readableStream, {
        status: 206,
        headers: {
          'Content-Range': "bytes " + start + "-" + end + "/" + fileSize,
          'Accept-Ranges': 'bytes',
          'Content-Length': contentLength.toString(),
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        },
      });

    } else {
      const stream = fs.createReadStream(filePath);

      const readableStream = new ReadableStream({
        start(controller) {
          stream.on('data', (chunk) => {
            // Forward the chunk directly
            controller.enqueue(chunk);
          });

          stream.on('end', () => {
            controller.close();
          });

          stream.on('error', (error) => {
            console.error('Stream error:', error);
            controller.error(error);
          });
        },

        cancel() {
          stream.destroy();
        }
      });

      return new Response(readableStream, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': fileSize.toString(),
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

  } catch (error) {
    console.error('Error in /api/stream:', error);

    return NextResponse.json(
      { error: 'Failed to stream file' },
      { status: 500 }
    );
  }
}
