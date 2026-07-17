'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const themes = [
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'dark', label: 'Dark', icon: '🌙' },
  ] as const;

  if (!mounted) {
    return (
      <div className="relative">
        <button
          type="button"
          className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground"
          aria-label="Toggle theme"
          disabled
        >
          <span className="text-lg opacity-0">🌙</span>
          <span className="hidden sm:inline opacity-0">Dark</span>
          <ChevronDown className="w-4 h-4 opacity-0" />
        </button>
      </div>
    );
  }

  const currentTheme = themes.find(t => t.value === theme) ?? themes[1];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Toggle theme"
      >
        <span className="text-lg">{currentTheme.icon}</span>
        <span className="hidden sm:inline">{currentTheme.label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-48 bg-popover text-popover-foreground rounded-md shadow-lg border border-border z-20 overflow-hidden">
            <div className="py-1">
              {themes.map((themeOption) => (
                <button
                  key={themeOption.value}
                  onClick={() => {
                    setTheme(themeOption.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center space-x-3 hover:bg-accent hover:text-accent-foreground transition-colors ${
                    theme === themeOption.value
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-muted-foreground'
                  }`}
                >
                  <span className="text-lg">{themeOption.icon}</span>
                  <span>{themeOption.label}</span>
                  {theme === themeOption.value && (
                    <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}