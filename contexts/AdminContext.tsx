'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AdminContextType {
  isAdmin: boolean;
  isDevelopment: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkStatus: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDevelopment, setIsDevelopment] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth');
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(!!data.isAdmin);
      }
    } catch (err) {
      console.error('Session_Status_Failure:', err);
    }
  }, []);

  useEffect(() => {
    // Check if we are in development mode
    const isDev = process.env.NODE_ENV === 'development';
    setIsDevelopment(isDev);
    
    // Initial sync with server
    checkStatus();
  }, [checkStatus]);

  const login = async (password: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        setIsAdmin(true);
        return true;
      }
    } catch (err) {
      console.error('Auth_Uplink_Failure:', err);
    }
    return false;
  };

  const logout = async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
      setIsAdmin(false);
    } catch (err) {
      console.error('Auth_Termination_Failure:', err);
    }
  };

  return (
    <AdminContext.Provider value={{ isAdmin, isDevelopment, login, logout, checkStatus }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}
