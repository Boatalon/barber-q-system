'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Scissors,
  Monitor,
  MessageSquare,
  Settings,
  Radio,
} from 'lucide-react';

export default function TopNav() {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/barber',
      label: 'แผงควบคุมช่าง (แทนปุ่มจริง)',
      icon: Scissors,
    },
    {
      href: '/display',
      label: 'จอหน้าร้าน (แทนจอ P10)',
      icon: Monitor,
    },
    {
      href: '/line-simulator',
      label: 'LINE OA ลูกค้า (จำลอง & Webhook)',
      icon: MessageSquare,
    },
    {
      href: '/settings',
      label: 'ตั้งค่ากติกาแจ้งเตือน',
      icon: Settings,
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/barber" className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <Scissors className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-slate-900">
                ระบบจองคิวร้านตัดผม
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <Radio className="h-3 w-3 animate-pulse" />
                Phase 1: Web + LINE OA
              </span>
            </div>
            <p className="text-xs text-slate-500">
              เซิร์ฟเวอร์คิวกลาง • เว็บแทนปุ่มกดจริง & จอหน้าร้าน • แจ้งเตือนผ่าน LINE
            </p>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href === '/barber' && pathname === '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

