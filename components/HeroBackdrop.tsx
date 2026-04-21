'use client';

import Image from 'next/image';

interface HeroBackdropProps {
  src: string;
  alt: string;
}

export default function HeroBackdrop({ src, alt }: HeroBackdropProps) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover opacity-20 blur-3xl scale-125"
      priority
      onError={(e) => { (e.target as any).style.opacity = '0'; }}
    />
  );
}
