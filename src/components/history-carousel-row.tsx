import type { ReactNode } from 'react';

export function HistoryCarouselRow({
  title,
  icon,
  empty,
  children,
}: {
  title: string;
  icon: ReactNode;
  empty?: string;
  children: ReactNode;
}) {
  const childCount = Array.isArray(children) ? children.length : children ? 1 : 0;
  if (childCount === 0 && empty) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground/70">{empty}</p>
      </section>
    );
  }
  if (childCount === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory -mx-1 px-1">
        {children}
      </div>
    </section>
  );
}
