import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Geist, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const sans = Geist({ subsets: ['latin'], variable: '--font-sans' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Kaanam — Noise console',
  description: 'Kaanam sensor console for environmental noise. Audio you upload is analysed in memory and is not saved.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="bg-obsidian font-sans antialiased">{children}</body>
    </html>
  )
}
