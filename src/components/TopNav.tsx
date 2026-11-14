'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Scissors, Monitor, Settings } from 'lucide-react';

export default function TopNav() {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/barber',
      label: 'คิวช่าง',
      fullLabel: 'แผงควบคุมช่าง',
      icon: Scissors,
    },
    {
      href: '/display',
      label: 'จอร้าน',
      fullLabel: 'จอหน้าร้าน',
      icon: Monitor,
    },
    {
      href: '/settings',
      label: 'ตั้งค่า',
      fullLabel: 'ตั้งค่าแจ้งเตือน',
      icon: Settings,
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 sm:px-4">
        <Link
          href="/barber"
          className="flex items-center gap-2 shrink-0 text-slate-900"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Scissors className="h-4 w-4" />
          </div>
          <span className="text-sm sm:text-base font-bold tracking-tight">
            คิวร้านตัดผม
          </span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href === '/barber' && pathname === '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span className="sm:hidden">{item.label}</span>
                <span className="hidden sm:inline">{item.fullLabel}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
