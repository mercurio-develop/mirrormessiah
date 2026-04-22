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
    <div className={`flex flex-col gap-2 shrink-0 ${className}`} ref={containerRef}>
      <span className="text-[11px] uppercase tracking-[0.2em] font-black text-foreground/50 ml-1">{label}</span>
      
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between gap-4 px-6 py-3 bg-card border border-border rounded-xl text-sm font-extrabold transition-all shadow-md hover:border-primary/40 text-left active:scale-[0.98] ${
            isOpen ? 'ring-4 ring-primary/5 border-primary/40' : ''
          }`}
        >
          <span className={!selectedOption ? 'text-muted-foreground/50' : 'text-foreground'}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute z-[110] left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden py-2"
            >
              <div className="max-h-64 overflow-y-auto scrollbar-hide">
                <button
                  type="button"
                  onClick={() => { onChange(''); setIsOpen(false); }}
                  className={`w-full px-5 py-3 flex items-center justify-between text-xs font-bold transition-colors hover:bg-muted ${
                    value === '' ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {placeholder}
                  {value === '' && <Check className="h-3 w-3" />}
                </button>
                
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.value); setIsOpen(false); }}
                    className={`w-full px-5 py-3 flex items-center justify-between text-xs font-bold transition-colors hover:bg-muted ${
                      value === opt.value ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {opt.label}
                    {value === opt.value && <Check className="h-3 w-3" />}
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
