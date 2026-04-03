import type { Metadata, Viewport } from 'next';
import { ThemeRootSync } from '@/components/ThemeRootSync';
import { ToastContainer } from '@/components/ToastContainer';
import { ConfirmProvider } from '@/components/useConfirm';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#E29578',
};

export const metadata: Metadata = {
  title: 'OfficeClaw',
  description: 'Your AI team collaboration space',
  manifest: '/manifest.json',
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OfficeClaw',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-ui-theme="business">
      <body className="min-h-screen">
        <ThemeRootSync />
        <ConfirmProvider>{children}</ConfirmProvider>
        <ToastContainer />
      </body>
    </html>
  );
}
