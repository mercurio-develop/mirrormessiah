'use client';

import React from 'react';

export const SciFiLogo = ({ className = "h-6 w-6", ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg 
    viewBox="0 0 100 100" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    {...props}
  >
    {/* Monolith Delta Frame (Triangle Down) */}
    <path 
      d="M50 95L5 10L95 10L50 95Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinejoin="miter" 
    />
    
    {/* Interior Data Rungs */}
    <path d="M20 35H80" stroke="currentColor" strokeWidth="1" className="opacity-40" />
    <path d="M30 55H70" stroke="currentColor" strokeWidth="1" className="opacity-40" />
    <path d="M40 75H60" stroke="currentColor" strokeWidth="1" className="opacity-40" />

    {/* The Core Sensor (Inverted V) */}
    <path 
      d="M35 25L50 45L65 25" 
      stroke="currentColor" 
      strokeWidth="4" 
      strokeLinecap="square"
      className="drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]"
    />

    {/* Scanning Line Animation */}
    <line x1="10" y1="15" x2="90" y2="15" stroke="currentColor" strokeWidth="0.5" className="animate-scan" />

    {/* Top Brackets */}
    <path d="M5 10V20M95 10V20" stroke="currentColor" strokeWidth="3" />
    
    {/* Central Pulsing Data-Point */}
    <rect x="47" y="42" width="6" height="6" fill="currentColor" className="animate-pulse" />

    <style jsx>{`
      @keyframes scan {
        0% { transform: translateY(0); opacity: 0; }
        50% { opacity: 1; }
        100% { transform: translateY(70px); opacity: 0; }
      }
      .animate-scan {
        animation: scan 3s linear infinite;
      }
    `}</style>
  </svg>
);
