'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AdminContextType {
  isAdmin: boolean;
  isDevelopment: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  logoutAdmin: () => Promise<void>;
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
    const isDev = process.env.NODE_ENV === 'development';
    setIsDevelopment(isDev);
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
        await checkStatus();
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

  const logoutAdmin = async () => {
    try {
      await fetch('/api/auth?mode=admin', { method: 'DELETE' });
      setIsAdmin(false);
    } catch (err) {
      console.error('Admin_Termination_Failure:', err);
    }
  };

  return (
    <AdminContext.Provider value={{ isAdmin, isDevelopment, login, logout, logoutAdmin, checkStatus }}>
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
