import React from 'react';
import '../styles/globals.css';
import AlertProvider from '@/components/AlertProvider';
import GlobalNotificationWrapper from '@/components/GlobalNotificationWrapper';
import AuthInitializer from '@/components/AuthInitializer';
import QueryProvider from '@/components/QueryProvider';

export const metadata = {
  title: '스테이하롱 관리자',
  description: '스테이하롱 관리자 전용 시스템',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-background text-foreground">
        <QueryProvider>
          <AlertProvider siteName="스테이 하롱 관리자">
            <AuthInitializer />
            <main className="w-full">{children}</main>
            <GlobalNotificationWrapper />
          </AlertProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
