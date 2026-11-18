'use client';

import Image from 'next/image';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Scissors, Monitor, Settings, ChevronDown } from 'lucide-react';

export default function TopNav() {
  const pathname = usePathname();
  const isDisplay = pathname === '/display';
  const [isVisible, setIsVisible] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 250);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY <= 16) {
        clearHideTimer();
        setIsVisible(true);
      } else if (e.clientY > 68) {
        scheduleHide();
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearHideTimer();
    };
  }, []);

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

  if (isDisplay) return null;

  return (
    <>
      {/* โซนตรวจจับเมาส์ขอบบนสุดของหน้าจอ + แถบเล็กสำหรับแตะเปิดบนมือถือ */}
      <div
        onMouseEnter={() => {
          clearHideTimer();
          setIsVisible(true);
        }}
        className="fixed inset-x-0 top-0 z-40 h-3 flex justify-center"
      >
        {!isVisible && (
          <button
            type="button"
            onClick={() => setIsVisible(true)}
            aria-label="เปิดแถบเมนูด้านบน"
            className="flex h-3.5 items-center justify-center rounded-b-lg bg-slate-900/20 px-3 text-slate-600 hover:bg-slate-900/40 hover:text-white transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* แถบ Navbar ด้านบน ซ่อนอัตโนมัติเมื่อเมาส์ไม่ได้อยู่ขอบบนสุด */}
      <header
        onMouseEnter={() => {
          clearHideTimer();
          setIsVisible(true);
        }}
        onMouseLeave={scheduleHide}
        className={`fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 shadow-md transition-transform duration-200 ease-out ${
          isVisible
            ? 'translate-y-0 pointer-events-auto'
            : '-translate-y-full pointer-events-none'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 sm:px-4">
          <Link
            href="/barber"
            onClick={() => setIsVisible(false)}
            className="flex items-center gap-2 shrink-0 text-slate-900"
          >
            <Image src="/signature-logo.png" alt="ซิกเนเจอร์" width={36} height={36} className="h-9 w-9 object-contain" />
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
                  onClick={() => setIsVisible(false)}
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
    </>
  );
}
