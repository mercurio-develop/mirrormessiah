'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Save, Loader2, Trash2, GraduationCap, ImageIcon, FolderOpen, Sparkles } from 'lucide-react';
import { updateCourseAction } from '../actions/update-course';
import { scrapeCourseThumbnailsAction, scrapeCourseMetadataAction } from '../actions/scrape-course';
import { DeleteCourseModal } from './delete-course-modal';
import { CourseFileExplorer } from './course-file-explorer';
import { COURSE_CATEGORIES, COURSE_PLATFORMS } from '../lib/course-taxonomy';
import { getCoursePosterUrl } from '../lib/course-artwork';

interface Course {
  id: number;
  title: string;
  year: number | null;
  plot: string | null;
  rating: number | null;
  platform: string | null;
  category: string | null;
  instructor: string | null;
  language: string | null;
  thumbnail: string | null;
  needs_repair: number;
}

const getPosterUrl = getCoursePosterUrl;

export function AdminCourseForm({ course }: { course: Course }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isScrapingThumbs, setIsScrapingThumbs] = useState(false);
  const [isScrapingMetadata, setIsScrapingMetadata] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [formData, setFormData] = useState({
    title: course.title || '',
    year: course.year?.toString() || '',
    plot: course.plot || '',
    rating: course.rating?.toString() || '',
    platform: course.platform || '',
    category: course.category || '',
    instructor: course.instructor || '',
    language: course.language || '',
    thumbnail: course.thumbnail || '',
    needs_repair: course.needs_repair === 1,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    startTransition(async () => {
      const result = await updateCourseAction(course.id, {
        ...formData,
        thumbnail: formData.thumbnail.split('?')[0],
        year: formData.year ? parseInt(formData.year) : null,
        rating: formData.rating ? parseFloat(formData.rating) : null,
        needs_repair: formData.needs_repair ? 1 : 0,
      });
      setStatus({ type: result.status === 'success' ? 'success' : 'error', msg: result.message || '' });
    });
  };

  const handleScrapeThumbs = async () => {
    setIsScrapingThumbs(true);
    const result = await scrapeCourseThumbnailsAction(course.id);
    setStatus({ type: result.status === 'success' ? 'success' : 'error', msg: result.message || '' });
    setIsScrapingThumbs(false);
  };

  const handleScrapeMetadata = async () => {
    setIsScrapingMetadata(true);
    const result = await scrapeCourseMetadataAction(course.id);
    setStatus({ type: result.status === 'success' ? 'success' : 'error', msg: result.message || '' });
    if (result.status === 'success') router.refresh();
    setIsScrapingMetadata(false);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-8 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            <div className="p-6 bg-card border border-border rounded-2xl space-y-4">
              <h3 className="font-bold flex items-center gap-2"><GraduationCap className="h-5 w-5 text-amber-500" /> Course Identity</h3>
              <input name="title" value={formData.title} onChange={handleChange} className="w-full h-12 px-4 border border-border rounded-xl bg-background" placeholder="Title" />
              <div className="grid grid-cols-2 gap-4">
                <select name="platform" value={formData.platform} onChange={handleChange} className="h-12 px-4 border border-border rounded-xl bg-background">
                  <option value="">Platform</option>
                  {COURSE_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  {formData.platform && !COURSE_PLATFORMS.includes(formData.platform as typeof COURSE_PLATFORMS[number]) ? (
                    <option value={formData.platform}>{formData.platform}</option>
                  ) : null}
                </select>
                <select name="category" value={formData.category} onChange={handleChange} className="h-12 px-4 border border-border rounded-xl bg-background">
                  <option value="">Category</option>
                  {COURSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <input name="instructor" value={formData.instructor} onChange={handleChange} className="h-12 px-4 border border-border rounded-xl bg-background" placeholder="Instructor" />
              <textarea name="plot" value={formData.plot} onChange={handleChange} rows={5} className="w-full p-4 border border-border rounded-xl bg-background" placeholder="Description" />
            </div>
            <button
              type="button"
              onClick={() => setIsFilesOpen(true)}
              className="w-full h-12 border border-border rounded-2xl font-bold flex items-center justify-center gap-2 hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors"
            >
              <FolderOpen className="h-5 w-5 text-amber-500" /> View Course Files
            </button>
          </div>
          <div className="lg:col-span-4 space-y-4">
            <div className="p-4 bg-card border border-border rounded-2xl">
              <div className="relative aspect-video rounded-xl overflow-hidden bg-muted mb-4">
                <Image src={getPosterUrl(formData.thumbnail)} alt="" fill unoptimized className="object-contain" />
              </div>
              <input name="thumbnail" value={formData.thumbnail} onChange={handleChange} className="w-full h-10 px-3 text-xs font-mono border border-border rounded-lg bg-muted/30" />
            </div>
            <button type="button" onClick={handleScrapeThumbs} disabled={isScrapingThumbs || isPending} className="w-full h-12 bg-zinc-900 border border-zinc-700 rounded-2xl font-bold flex items-center justify-center gap-2">
              {isScrapingThumbs ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />} Scrape Lesson Thumbnails
            </button>
            <button type="button" onClick={handleScrapeMetadata} disabled={isScrapingMetadata || isPending} className="w-full h-12 bg-zinc-900 border border-zinc-700 rounded-2xl font-bold flex items-center justify-center gap-2">
              {isScrapingMetadata ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />} Scrape Metadata (Gemini)
            </button>
            <button type="submit" disabled={isPending} className="w-full h-12 bg-amber-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2">
              {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} Save Changes
            </button>
            <button type="button" onClick={() => setIsDeleteOpen(true)} className="w-full h-12 border border-destructive/30 text-destructive rounded-2xl font-bold flex items-center justify-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete Course
            </button>
            {status ? <p className={`text-xs font-bold ${status.type === 'success' ? 'text-green-500' : 'text-destructive'}`}>{status.msg}</p> : null}
          </div>
        </div>
      </form>
      <DeleteCourseModal course={{ id: course.id, title: formData.title }} isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} onDeleted={() => router.push('/admin/courses')} />
      <CourseFileExplorer
        courseId={course.id}
        courseTitle={formData.title}
        isOpen={isFilesOpen}
        onClose={() => setIsFilesOpen(false)}
      />
    </>
  );
}
