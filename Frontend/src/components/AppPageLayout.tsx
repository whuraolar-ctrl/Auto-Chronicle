import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CarFront,
  CircleDollarSign,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { api } from '../services/api';

/** Shared brand mark: a tiny steering-wheel style badge instead of plain text initials. */
function BrandMark() {
  return (
    <span className="app-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="2.6" />
        <path d="M3.4 10.8c3-1.4 6.2-2.1 8.6-2.1s5.6.7 8.6 2.1" />
        <path d="M12 14.6V21" />
        <path d="M9.4 21h5.2" />
      </svg>
    </span>
  );
}

const pageLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/expenses', label: 'Expenses', icon: CircleDollarSign },
  { to: '/vehicles', label: 'Vehicles', icon: CarFront },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/car-fund', label: 'Car Fund', icon: Gauge },
  { to: '/fleet', label: 'Fleet', icon: Users },
  { to: '/profile', label: 'Profile', icon: UserCircle2 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

interface AppPageLayoutProps {
  children: ReactNode;
  /** Use for full-width dashboard content; default caps at max-w-7xl */
  wide?: boolean;
}

export default function AppPageLayout({
  children,
  wide = false,
}: AppPageLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Clear the local session even if the server request fails.
    } finally {
      localStorage.removeItem('sb-auth-token');
      setMobileMenuOpen(false);
      navigate('/login', { replace: true });
    }
  };

  const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `app-sidebar-link ${isActive ? 'active' : ''}`;

  const renderLink = (link: (typeof pageLinks)[number]) => {
    const Icon = link.icon;

    return (
      <NavLink
        key={link.to}
        to={link.to}
        onClick={() => setMobileMenuOpen(false)}
        className={navLinkClassName}
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
        <span>{link.label}</span>
      </NavLink>
    );
  };

  return (
    <div className="app-shell min-h-screen">
      <aside className="app-sidebar hidden lg:flex" aria-label="Sidebar navigation">
        <div className="app-sidebar-panel">
          <NavLink to="/" className="app-brand" onClick={() => setMobileMenuOpen(false)}>
            <BrandMark />
            <div>
              <span className="app-brand-name">AUTO CHRONICLE</span>
              <span className="app-brand-subtitle">Fleet command</span>
            </div>
          </NavLink>

          <nav aria-label="Main navigation" className="app-sidebar-nav">
            {pageLinks.map(renderLink)}
          </nav>

          <div className="app-sidebar-footer mt-auto">
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `app-sidebar-link app-sidebar-admin ${isActive ? 'active' : ''}`
              }
            >
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              <span>Admin</span>
            </NavLink>
            <button
              type="button"
              className="app-sidebar-link app-sidebar-logout"
              onClick={handleLogout}
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="app-content flex-1">
        <header className="app-mobile-header lg:hidden">
          <button
            type="button"
            aria-label="Open navigation menu"
            className="app-mobile-toggle"
            onClick={() => setMobileMenuOpen((current) => !current)}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>

          <NavLink to="/" className="app-brand app-brand-mobile" onClick={() => setMobileMenuOpen(false)}>
            <BrandMark />
            <span className="app-brand-name">AUTO CHRONICLE</span>
          </NavLink>
        </header>

        {mobileMenuOpen && (
          <div className="app-mobile-nav-root lg:hidden">
            <button
              type="button"
              aria-label="Close navigation menu"
              className="app-mobile-backdrop"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="app-mobile-nav-panel">
              <NavLink
                to="/"
                className="app-brand mb-4"
                onClick={() => setMobileMenuOpen(false)}
              >
                <BrandMark />
                <span className="app-brand-name">AUTO CHRONICLE</span>
              </NavLink>
              <nav aria-label="Mobile navigation" className="app-sidebar-nav">
                {pageLinks.map(renderLink)}
              </nav>
              <div className="app-sidebar-footer mt-4">
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `app-sidebar-link app-sidebar-admin ${isActive ? 'active' : ''}`
                  }
                >
                  <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                  <span>Admin</span>
                </NavLink>
                <button
                  type="button"
                  className="app-sidebar-link app-sidebar-logout"
                  onClick={handleLogout}
                >
                  <LogOut aria-hidden="true" className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <main
          className={`mx-auto w-full px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8 lg:px-10 ${wide ? '' : 'max-w-7xl'}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
