import React, { useState, useContext, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { AuthContext } from '../context/AuthContext';
import Image from 'next/image';

const Navbar = () => {
  const { user, logout, isLoading } = useContext(AuthContext);
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => { setIsDropdownOpen(false); }, [user]);
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const getUserInitial = () => user?.username?.charAt(0).toUpperCase() ?? '';

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsDropdownOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setIsDropdownOpen(false), 250);
  };

  const navLinks = [
    { label: 'Browse',      href: '/browse'      },
    { label: 'Community',   href: '/community'   },
    { label: 'Collections', href: '/collections' },
  ];

  const isActive = (href) => router.pathname === href;

  return (
    <header className="sticky top-0 z-50 bg-surface border-b border-border">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">

        {/* Logo */}
        <Link href="/" className="flex items-center flex-shrink-0">
          <Image
            src="/images/logo.png"
            alt="NumisRoma"
            width={120}
            height={40}
            priority
            sizes="120px"
            className="h-9 w-auto object-contain opacity-90 hover:opacity-100 transition-opacity duration-200"
          />
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={`font-sans text-sm font-medium transition-colors duration-200 ${
                isActive(href) ? 'text-text-primary font-medium' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-3">
          {isLoading ? (
            <div className="w-9 h-9 rounded-full animate-pulse bg-surface-alt" />
          ) : user ? (
            <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <button className="flex items-center focus:outline-none">
                {user.profileImage ? (
                  <Image
                    src={user.profileImage}
                    alt="Profile"
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full object-cover border border-border hover:opacity-90 transition-opacity duration-200"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-sans font-semibold text-sm bg-amber text-[#fdf8f0]">
                    {getUserInitial()}
                  </div>
                )}
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 rounded-md py-1 z-50 animate-fade-in bg-card border border-border shadow-md">
                  <div className="px-4 py-2.5 border-b border-border">
                    <p className="font-sans text-sm font-medium truncate text-text-primary">{user.username}</p>
                    <p className="font-sans text-xs truncate mt-0.5 text-text-muted">{user.email}</p>
                  </div>
                  {[
                    { label: 'Profile',  href: `/profile?id=${user._id}` },
                    { label: 'Messages', href: '/messages'  },
                    { label: 'Settings', href: '/settings'  },
                  ].map(({ label, href }) => (
                    <Link
                      key={label}
                      href={href}
                      onClick={() => setIsDropdownOpen(false)}
                      className="block px-4 py-2 font-sans text-sm text-text-secondary hover:bg-surface-alt hover:text-text-primary transition-colors duration-150"
                    >
                      {label}
                    </Link>
                  ))}
                  <div className="border-t border-border mt-1 pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 font-sans text-sm text-red-700 hover:bg-red-50 transition-colors duration-150"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="font-sans text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="font-sans text-sm font-medium px-4 py-2 rounded bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-200"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
