import type { Metadata } from 'next'
import '@/lib/db_migrate'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { AdminProvider } from '@/contexts/admin-context'
import { Navbar } from '@/components/navbar'
import { Suspense } from 'react'

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
    <html lang="en" className="h-full" suppressHydrationWarning>
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
