import type { Metadata } from 'next';
import './globals.css';
import TopNav from '@/components/TopNav';

export const metadata: Metadata = {
  title: 'ระบบจองคิวร้านตัดผม | Barber Queue System',
  description:
    'ระบบรันคิวร้านตัดผม รองรับรับคิวหน้าร้านและผ่าน LINE OA พร้อมเว็บควบคุมคิวสำหรับช่างและจอแสดงผลหน้าร้าน',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <TopNav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}

