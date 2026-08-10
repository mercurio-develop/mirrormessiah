'use client';

import { useRef, useState, type MouseEvent, type ReactNode } from 'react';

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
  const trackRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

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

  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;

    event.preventDefault();
    setIsDragging(true);

    const startX = event.pageX;
    const startScroll = track.scrollLeft;
    let moved = false;

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = moveEvent.pageX - startX;
      if (Math.abs(delta) > 4) moved = true;
      track.scrollLeft = startScroll - delta;
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setIsDragging(false);
      if (moved) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
      </div>
      <div
        ref={trackRef}
        onMouseDown={onMouseDown}
        onClickCapture={onClickCapture}
        className={`flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory -mx-1 px-1 touch-pan-x ${
          isDragging ? 'cursor-grabbing snap-none' : 'cursor-grab'
        }`}
      >
        {children}
      </div>
    </section>
  );
}
