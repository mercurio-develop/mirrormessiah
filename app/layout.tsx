import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AdminProvider } from '@/contexts/AdminContext'
import Navbar from '@/components/Navbar'

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
    <html lang="en" className="h-full">
      <body className="h-full font-sans">
        <ThemeProvider>
          <AdminProvider>
            <Navbar />
            <main className="min-h-screen pt-20">
              {children}
            </main>
          </AdminProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
