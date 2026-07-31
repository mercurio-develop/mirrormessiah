import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { MediaPlayer } from '@/features/movie/components/media-player';
import { ChevronLeft, SkipBack, SkipForward, Activity } from 'lucide-react';
import { getLessonContext } from '@/features/course/queries/get-lesson-context';
import { LessonWatchLayout } from '@/features/course/components/lesson-watch-layout';

export const dynamic = 'force-dynamic';

export default async function LearnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lessonId = parseInt(id);
  if (isNaN(lessonId)) notFound();

  const data = getLessonContext(lessonId);
  if (!data) notFound();

  const cookieStore = await cookies();
  const gateToken = cookieStore.get('mm_gate_token')?.value;
  if (gateToken) {
    data.source.src += `&t=${gateToken}`;
    if (data.subtitles) {
      data.subtitles = data.subtitles.map((s) => ({
        ...s,
        src: s.src + `&t=${gateToken}`,
      }));
    }
  }

  const { lesson, playlist, nextLessonId, prevLessonId } = data;

  return (
    <div className="min-h-screen bg-black text-foreground flex flex-col h-screen overflow-hidden">
      <div className="z-20 bg-black/80 border-b border-white/5 shrink-0">
        <div className="max-w-[1800px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <Link href={`/courses/${lesson.course_id}`} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <h2 className="text-sm font-black truncate">{lesson.course_title as string}</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                Module {lesson.module_number as number} · Lesson {lesson.lesson_number as number}
                {lesson.title ? ` · ${lesson.title as string}` : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {prevLessonId ? (
              <Link href={`/learn/${prevLessonId}`} className="px-3 py-2 rounded-lg bg-white/5 text-xs font-bold flex items-center gap-1"><SkipBack className="h-4 w-4" /> Prev</Link>
            ) : null}
            {nextLessonId ? (
              <Link href={`/learn/${nextLessonId}`} className="px-3 py-2 rounded-lg bg-primary text-xs font-bold flex items-center gap-1">Next <SkipForward className="h-4 w-4" /></Link>
            ) : null}
          </div>
        </div>
      </div>

      <LessonWatchLayout playlist={playlist as any[]} currentLessonId={lesson.id as number}>
        <section className="w-full bg-black aspect-video lg:aspect-auto lg:h-[calc(100vh-12rem)] relative">
          {!data.source ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <Activity className="h-12 w-12 text-destructive mb-4" />
              <p className="font-black uppercase">Stream Unavailable</p>
            </div>
          ) : (
            <MediaPlayer
              id={`lesson_${lesson.id}`}
              src={data.source.src}
              mimeType={data.mimeType}
              subtitles={data.subtitles}
              title={`${lesson.course_title} - L${lesson.lesson_number} ${lesson.title || ''}`}
              className="w-full h-full"
            />
          )}
        </section>
        <main className="px-4 sm:px-6 py-8">
          <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight">{lesson.title as string || `Lesson ${lesson.lesson_number}`}</h1>
          {lesson.plot ? <p className="mt-4 text-white/70 leading-relaxed max-w-3xl">{lesson.plot as string}</p> : null}
        </main>
      </LessonWatchLayout>
    </div>
  );
}
