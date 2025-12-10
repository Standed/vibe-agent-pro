import type { Metadata } from 'next';
// import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { I18nProvider } from '@/components/providers/I18nProvider';
import { DndProvider } from '@/components/providers/DndProvider';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Toaster } from 'sonner';

// const geistSans = Geist({
//   variable: '--font-geist-sans',
//   subsets: ['latin'],
// });

// const geistMono = Geist_Mono({
//   variable: '--font-geist-mono',
//   subsets: ['latin'],
// });

export const metadata: Metadata = {
  title: 'Vibe Agent Pro - 西羊石 AI 影视创作工具',
  description: 'AI-powered video production tool',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
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
