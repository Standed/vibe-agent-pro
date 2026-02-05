import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { I18nProvider } from '@/components/providers/I18nProvider';
import { DndProvider } from '@/components/providers/DndProvider';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Toaster } from 'sonner';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Video Agent Pro - 西羊石 AI 影视创作工具',
  description: 'AI-powered video production tool',
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body
        className={`font-sans antialiased bg-light-bg dark:bg-cine-black text-light-text dark:text-white`}
        suppressHydrationWarning
      >
        <AuthProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <DndProvider>
              <I18nProvider>
                {children}
                <Toaster
                  position="top-center"
                  richColors
                  closeButton
                  duration={4000}
                />
              </I18nProvider>
            </DndProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
