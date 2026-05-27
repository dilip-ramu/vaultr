import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'InEx — Personal Finance',
  description: 'Your personal finance command centre',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/vaultr-logo.png', sizes: '16x16', type: 'image/png' },
      { url: '/vaultr-logo.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/vaultr-logo.png', sizes: '192x192' },
      { url: '/vaultr-logo.png', sizes: '512x512' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'InEx',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#6366F1',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
