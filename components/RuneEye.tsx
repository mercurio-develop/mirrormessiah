import React from 'react';

export const RuneEye = ({ className = "h-6 w-6", ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg 
    viewBox="0 0 100 100" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    {...props}
  >
    {/* Outer Ocular Frame */}
    <path 
      d="M10 50C10 50 25 20 50 20C75 20 90 50 90 50C90 50 75 80 50 80C25 80 10 50 10 50Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinejoin="round" 
    />
    
    {/* The Pupil Ring */}
    <circle cx="50" cy="50" r="15" stroke="currentColor" strokeWidth="1" strokeDasharray="4 2" />
    
    {/* The Rune Iris (The Messiah Eye) */}
    <path 
      d="M50 35V65M35 50H65" 
      stroke="currentColor" 
      strokeWidth="4" 
      strokeLinecap="square"
    />
    
    {/* Ancient Power Runes */}
    <path d="M25 35L30 40M70 35L75 40M25 65L30 60M70 65L75 60" stroke="currentColor" strokeWidth="2" />
    
    {/* The Core Spark */}
    <rect x="47" y="47" width="6" height="6" fill="currentColor" className="animate-pulse" />
  </svg>
);
