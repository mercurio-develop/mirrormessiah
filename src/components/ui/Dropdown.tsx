'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Option {
  value: string;
  label: string;
}

interface DropdownProps {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function Dropdown({ 
  label, 
  options, 
  value, 
  onChange, 
  placeholder = 'Select...',
  className = ''
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const selectedOption = options.find(opt => opt.value === value);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`flex flex-col gap-1.5 shrink-0 ${className}`} ref={containerRef}>
      <span className="text-[10px] uppercase tracking-[0.25em] font-black text-foreground/40 ml-1 leading-none">{label}</span>
      
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between gap-3 px-4 h-11 bg-muted/20 hover:bg-muted/40 border border-border/50 rounded-xl text-[13px] font-bold transition-all shadow-sm hover:border-primary/30 text-left active:scale-[0.98] ${
            isOpen ? 'ring-4 ring-primary/5 border-primary/40 bg-muted/40' : ''
          }`}
        >
          <span className={`truncate ${!selectedOption ? 'text-muted-foreground/50' : 'text-foreground/90'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-500 ease-out ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="absolute z-[150] left-0 right-0 mt-2 bg-card/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden py-2"
            >
              <div className="max-h-60 overflow-y-auto custom-scrollbar">
                <button
                  type="button"
                  onClick={() => { onChange(''); setIsOpen(false); }}
                  className={`w-full px-4 py-2.5 flex items-center justify-between text-[12px] font-bold transition-all hover:bg-primary/10 group ${
                    value === '' ? 'text-primary' : 'text-muted-foreground/70 hover:text-foreground'
                  }`}
                >
                  <span className="truncate">{placeholder}</span>
                  {value === '' && <Check className="h-3 w-3 stroke-[3]" />}
                </button>
                
                <div className="h-px bg-border/40 mx-2 my-1" />

                {options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.value); setIsOpen(false); }}
                    className={`w-full px-4 py-2.5 flex items-center justify-between text-[12px] font-bold transition-all hover:bg-primary/10 group ${
                      value === opt.value ? 'text-primary' : 'text-foreground/80 hover:text-foreground'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {value === opt.value && <Check className="h-3 w-3 stroke-[3]" />}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
