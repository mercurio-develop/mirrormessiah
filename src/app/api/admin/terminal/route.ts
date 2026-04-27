import { NextRequest, NextResponse } from 'next/server';
import { requireAdminKey } from '@/lib/auth';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await requireAdminKey(request);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { script, command, args = [] } = body;

    const allowedScripts = ['scripts/mm.py', 'scripts/series_cli.py', 'scripts/convert_to_web.py'];
    if (!allowedScripts.includes(script)) {
      return NextResponse.json({ error: 'Invalid script' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        let isClosed = false;

        const safeEnqueue = (text: string) => {
          if (!isClosed) {
            try {
              controller.enqueue(encoder.encode(text));
            } catch (e) {
              isClosed = true;
            }
          }
        };

        const pyArgs = [script];
        if (command) pyArgs.push(command);
        if (Array.isArray(args)) pyArgs.push(...args);
        
        safeEnqueue(`> python3 ${pyArgs.join(' ')}\n\n`);

        const child = spawn('python3', pyArgs, {
          cwd: process.cwd(),
          env: process.env,
        });

        // Store child so we can kill it if the connection drops
        (controller as any)._childProcess = child;

        child.stdout.on('data', (data) => {
          safeEnqueue(data.toString());
        });

        child.stderr.on('data', (data) => {
          safeEnqueue(data.toString());
        });

        child.on('close', (code) => {
          safeEnqueue(`\n[Process exited with code ${code}]\n`);
          if (!isClosed) {
            try {
              isClosed = true;
              controller.close();
            } catch (e) {}
          }
        });
        
        child.on('error', (err) => {
          safeEnqueue(`\n[Process error: ${err.message}]\n`);
          if (!isClosed) {
            try {
              isClosed = true;
              controller.close();
            } catch (e) {}
          }
        });
      },
      cancel(controller) {
        try {
          const child = (controller as any)._childProcess;
          if (child && !child.killed) {
            child.kill('SIGKILL');
          }
        } catch (e) {
          console.error('Failed to kill terminal process on disconnect:', e);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to execute command' }, { status: 500 });
  }
}
