'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Trash2, HardDrive, Loader2 } from 'lucide-react';
import { deleteCourseAction } from '../actions/delete-course';

export function DeleteCourseModal({
  course,
  isOpen,
  onClose,
  onDeleted,
}: {
  course: { id: number; title: string };
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [deleteDirectory, setDeleteDirectory] = useState(false);
  const [isPending, startTransition] = useTransition();
  if (!isOpen) return null;

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteCourseAction([course.id], { deleteFiles, deleteDirectory });
      if (result.status === 'success') onDeleted();
      else alert(result.message);
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card border border-destructive/30 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />
            <div>
              <h2 className="text-xl font-black">Confirm Deletion</h2>
              <p className="text-sm text-muted-foreground mt-2">Remove <strong>{course.title}</strong> from the registry?</p>
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)} />
            <span className="text-sm font-bold flex items-center gap-2"><HardDrive className="h-4 w-4" /> Delete media files</span>
          </label>
          <label className={`flex items-center gap-3 ${deleteFiles ? '' : 'opacity-40'}`}>
            <input type="checkbox" checked={deleteDirectory} disabled={!deleteFiles} onChange={(e) => setDeleteDirectory(e.target.checked)} />
            <span className="text-sm">Delete course folder</span>
          </label>
        </div>
        <div className="flex p-4 gap-3 border-t border-border/50">
          <button onClick={onClose} disabled={isPending} className="flex-1 h-12 border border-border rounded-xl font-bold">Cancel</button>
          <button onClick={handleDelete} disabled={isPending} className="flex-1 h-12 bg-destructive text-white rounded-xl font-bold flex items-center justify-center gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Purge
          </button>
        </div>
      </div>
    </div>
  );
}
