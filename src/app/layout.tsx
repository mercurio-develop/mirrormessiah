import type { Metadata } from 'next'
import '@/lib/db_migrate'
import './globals.css'
import { ThemeProvider } from '@/contexts/theme-context'
import { AdminProvider } from '@/contexts/admin-context'
import { Navbar } from '@/components/navbar'
import { Suspense } from 'react'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'MirrorMessiah | Premium Media Registry',
  description: 'A private high-fidelity media collection for the ultimate viewing experience.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`h-full dark`} suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme');
                if (theme === 'light' || (!theme && window.matchMedia('(prefers-color-scheme: light)').matches)) {
                  document.documentElement.classList.remove('dark');
                } else {
                  document.documentElement.classList.add('dark');
                }
              } catch (_) {}
            `,
          }}
        />
        <Script 
          src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1" 
          strategy="beforeInteractive" 
        />
      </head>
      <body className="h-full font-sans antialiased">
        <ThemeProvider>
          <AdminProvider>
            <Suspense fallback={<div className="h-20" />}>
              <Navbar />
            </Suspense>
            <main className="min-h-screen pt-20">
              <Suspense fallback={null}>
                {children}
              </Suspense>
            </main>
          </AdminProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
