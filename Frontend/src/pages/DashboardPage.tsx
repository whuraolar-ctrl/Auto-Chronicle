import axios from 'axios';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CarFront,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CreditCard,
  LogOut,
  Settings,
  ShieldCheck,
  Target,
  UserRound,
  Wallet,
  Wrench,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';

import AppPageLayout from '../components/AppPageLayout';
import { api } from '../services/api';

/* Types */

interface Fleet {
  id: string;
  name: string;
}

interface DriverReport {
  id: string;
  vehicleId: string;
  category: string;
  severity: string;
  description: string | null;

  status: string;
  createdAt: string;
}

interface DashboardSummary {
  totalVehicles: number;
  vehiclesNeedingAttention: number;
  vehiclesReadyToDrive: number;
  newDriverReports: {
    count: number;
    recent: DriverReport[];
  };
  monthlyExpenses: {
    total: number | string;
    currency: string;
  };
}

interface Vehicle {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number;
  plate_number: string;
  mileage_km: number | null;
  next_service: string | null;

  is_archived: boolean;
}

interface VehicleListResponse {
  data: Vehicle[];
  meta: {
    page: number;
    total: number;
    totalPages: number;
  };
}

interface CarFund {
  id: string;
  targetAmount: number;
  currency: string;
  targetDate: string | null;
  contributionCadence: 'daily' | 'weekly' | 'monthly' | null;
  plannedContributionAmount: number | null;
  remindersEnabled: boolean;
}

interface FundSummary {
  fund: CarFund | null;
  balance: number;
  remaining?: number;
  progressPercent: number;

  suggestedContributions?: {
    daily: number;
    weekly: number;
    monthly: number;
  } | null;
}

type NotificationPriority = 'urgent' | 'high' | 'normal';

type NotificationType =
  | 'service_due'
  | 'insurance_expiry'
  | 'car_fund_contribution'
  | 'car_fund_goal';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  dueDate: string;
  actionUrl: string;
  entityId: string;
  isRead?: boolean;
}

interface NotificationResponse {
  data: NotificationItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface ApiErrorResponse {
  message?: string | string[];
}

/* Helpers */

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const message = error.response?.data?.message;

    if (Array.isArray(message)) {
      return message.join(', ');
    }

    if (message) {
      return message;
    }

    if (!error.response) {
      return 'Unable to connect to the server. Please check your connection.';
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function formatMoney(value: number | string, currency: string): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return '—';
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'Not scheduled';
  }

  const date = new Date(`${value.slice(0, 10)}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getGreeting(date = new Date()): string {
  const hour = date.getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 17) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

function getVehicleName(vehicle: Vehicle): string {
  return (
    vehicle.name?.trim() ||
    `${vehicle.make} ${vehicle.model}`.trim() ||
    'Vehicle'
  );
}

function getPriorityLabel(priority: NotificationPriority): string {
  switch (priority) {
    case 'urgent':
      return 'Urgent';
    case 'high':
      return 'High priority';
    default:
      return 'Reminder';
  }
}

function getNotificationIcon(type: NotificationType): ReactNode {
  switch (type) {
    case 'service_due':
      return <Wrench aria-hidden="true" className="h-5 w-5" />;
    case 'insurance_expiry':
      return <ShieldCheck aria-hidden="true" className="h-5 w-5" />;
    case 'car_fund_contribution':
      return <DollarSign aria-hidden="true" className="h-5 w-5" />;
    case 'car_fund_goal':
      return <Target aria-hidden="true" className="h-5 w-5" />;
    default:
      return <Bell aria-hidden="true" className="h-5 w-5" />;
  }
}

export default function DashboardPage() {
  const navigate = useNavigate();

  const [greeting, setGreeting] = useState(() => getGreeting());

  const [userName, setUserName] = useState('');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [selectedFleetId, setSelectedFleetId] = useState('');

  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [totalVehicles, setTotalVehicles] = useState(0);

  const [fundSummary, setFundSummary] = useState<FundSummary | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [notificationTotal, setNotificationTotal] = useState(0);

  const [notificationOpen, setNotificationOpen] = useState(false);

  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const [notificationsError, setNotificationsError] = useState('');

  const [fleetsLoading, setFleetsLoading] = useState(true);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [fundLoading, setFundLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [pageError, setPageError] = useState('');

  /* Greeting */

  useEffect(() => {
    const updateGreeting = () => {
      setGreeting(getGreeting());
    };

    updateGreeting();

    // Refresh the greeting periodically in the browser's local time zone.
    const interval = window.setInterval(updateGreeting, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  /* Authenticated user */

  useEffect(() => {
    let cancelled = false;

    async function loadUserName() {
      try {
        /*
         * This assumes your existing API exposes GET /auth/me.
         * If your frontend already obtains the profile from an auth context,
         * use that existing context instead of adding a second auth request.
         */
        const response = await api.get('/auth/me');

        if (cancelled) {
          return;
        }

        const payload =
          response.data?.user ??
          response.data?.data?.user ??
          response.data?.data ??
          response.data;

        const profile = payload?.profile ?? payload;

        const firstName = profile?.firstName ?? profile?.first_name ?? '';

        const lastName = profile?.lastName ?? profile?.last_name ?? '';

        const fullName =
          profile?.fullName ??
          profile?.full_name ??
          profile?.name ??
          `${firstName} ${lastName}`.trim();

        setUserName(typeof fullName === 'string' ? fullName.trim() : '');

        const email = profile?.email ?? payload?.email ?? '';

        setUserEmail(typeof email === 'string' ? email : '');
      } catch {
        /*
         * The greeting still works if the endpoint is unavailable.
         * Do not invent a user name.
         */
        if (!cancelled) {
          setUserName('');
        }
      }
    }

    void loadUserName();

    return () => {
      cancelled = true;
    };
  }, []);

  /* Vehicles */

  const loadVehicles = useCallback(async () => {
    setVehiclesLoading(true);

    try {
      const response = await api.get<VehicleListResponse>('/vehicles', {
        params: {
          page: 1,
          limit: 4,
          archived: false,
        },
      });

      setVehicles(response.data.data ?? []);

      setTotalVehicles(response.data.meta?.total ?? 0);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVehicles().catch((error: unknown) => {
      setPageError(getErrorMessage(error));
    });
  }, [loadVehicles]);

  /* Car Fund */

  useEffect(() => {
    let cancelled = false;

    async function loadFund() {
      setFundLoading(true);

      try {
        const response = await api.get<FundSummary>('/car-fund');

        if (!cancelled) {
          setFundSummary(response.data);
        }
      } catch (error) {
        if (!cancelled) {
          /*
           * A missing Car Fund is a valid state for a new user.
           * Keep it separate from a genuine request failure.
           */
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            setFundSummary(null);
          } else {
            setPageError(getErrorMessage(error));
          }
        }
      } finally {
        if (!cancelled) {
          setFundLoading(false);
        }
      }
    }

    void loadFund();

    return () => {
      cancelled = true;
    };
  }, []);

  /* Fleets */

  useEffect(() => {
    let cancelled = false;

    async function loadFleets() {
      setFleetsLoading(true);

      try {
        const response = await api.get('/fleets');

        if (cancelled) {
          return;
        }

        const payload = response.data?.data ?? response.data;

        const fleetList: Fleet[] = Array.isArray(payload) ? payload : [];

        setFleets(fleetList);

        setSelectedFleetId((current) => {
          if (current && fleetList.some((fleet) => fleet.id === current)) {
            return current;
          }

          return fleetList[0]?.id ?? '';
        });
      } catch {
        /*
         * Personal vehicle dashboard functionality remains available
         * even when the user has no fleet or fleet access is unavailable.
         */
        if (!cancelled) {
          setFleets([]);
          setSelectedFleetId('');
        }
      } finally {
        if (!cancelled) {
          setFleetsLoading(false);
        }
      }
    }

    void loadFleets();

    return () => {
      cancelled = true;
    };
  }, []);

  /* Fleet dashboard */

  useEffect(() => {
    let cancelled = false;

    async function loadFleetDashboard() {
      if (!selectedFleetId) {
        setDashboard(null);
        return;
      }

      setDashboardLoading(true);

      try {
        const response = await api.get<DashboardSummary>('/fleet/dashboard', {
          params: {
            fleetId: selectedFleetId,
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
          },
        });

        if (!cancelled) {
          setDashboard(response.data);
        }
      } catch (error) {
        if (!cancelled) {
          setDashboard(null);
          setPageError(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setDashboardLoading(false);
        }
      }
    }

    void loadFleetDashboard();

    return () => {
      cancelled = true;
    };
  }, [selectedFleetId]);

  /* Notifications */

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError('');

    try {
      const response = await api.get<NotificationResponse>('/notifications', {
        params: {
          page: 1,
          limit: 10,
        },
      });

      setNotifications(response.data.data ?? []);
      setNotificationTotal(response.data.meta?.total ?? 0);
    } catch (error) {
      setNotificationsError(getErrorMessage(error));
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  /*
   * Your current backend generates notifications dynamically and doesn't
   * persist read status. Therefore, don't claim to know the unread count.
   */
  const unreadCount: number | null = useMemo(() => {
    const hasReadTracking =
      notifications.length > 0 &&
      notifications.every(
        (notification) => typeof notification.isRead === 'boolean',
      );

    if (!hasReadTracking) {
      return null;
    }

    return notifications.filter((notification) => !notification.isRead).length;
  }, [notifications]);

  const handleNotificationClick = (notification: NotificationItem) => {
    setNotificationOpen(false);

    /*
     * Only allow internal application paths.
     * Do not navigate to arbitrary URLs supplied by API data.
     */
    if (
      notification.actionUrl &&
      notification.actionUrl.startsWith('/') &&
      !notification.actionUrl.startsWith('//')
    ) {
      navigate(notification.actionUrl);
    }
  };

  /* Derived values */

  const displayedVehicles = useMemo(
    () => vehicles.filter((vehicle) => !vehicle.is_archived),
    [vehicles],
  );

  const upcomingMaintenance = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return displayedVehicles
      .filter((vehicle) => vehicle.next_service)
      .sort((first, second) => {
        return (first.next_service ?? '').localeCompare(
          second.next_service ?? '',
        );
      })
      .filter((vehicle) => {
        const serviceDate = new Date(
          `${vehicle.next_service!.slice(0, 10)}T12:00:00`,
        );

        return !Number.isNaN(serviceDate.getTime());
      })
      .slice(0, 3);
  }, [displayedVehicles]);

  const monthlyExpenses = dashboard?.monthlyExpenses;

  const attentionCount = dashboard?.vehiclesNeedingAttention ?? 0;

  const driverReportCount = dashboard?.newDriverReports?.count ?? 0;

  const carFundProgress = Math.max(
    0,
    Math.min(100, fundSummary?.progressPercent ?? 0),
  );

  const carFund = fundSummary?.fund ?? null;

  return (
    <AppPageLayout wide>
      <div className="mx-auto w-full max-w-[1600px] space-y-8 pb-10">
        {/* Header */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-600">AUTO CHRONICLE</p>

            <h1
              className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-
3xl"
            >
              {greeting}
              {userName ? `, ${userName}` : ''}!
            </h1>

            <p className="mt-2 text-sm text-slate-500 sm:text-base">
              Here's your vehicle overview. Let's keep everything running
              smoothly.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationOpen((current) => !current)}
                aria-label="Open notifications"
                aria-expanded={notificationOpen}
                className="relative flex h-12 w-12 items-center justify-center rounded-2xl
border border-slate-200 bg-white text-xl text-slate-700 shadow-sm transition hover:bg-
slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <Bell aria-hidden="true" className="h-5 w-5" />

                {unreadCount !== null && unreadCount > 0 && (
                  <span
                    className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center
justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}

                {unreadCount === null && notificationTotal > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-teal-500" />
                )}
              </button>

              {notificationOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close notifications"
                    className="fixed inset-0 z-30 cursor-default"
                    onClick={() => setNotificationOpen(false)}
                  />

                  <div
                    className="absolute right-0 z-40 mt-3 w-[min(24rem,calc(100vw-
2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                  >
                    <div
                      className="flex items-center justify-between border-b border-slate-
100 px-4 py-4"
                    >
                      <div>
                        <h2 className="font-semibold text-slate-900">
                          Notifications
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          Vehicle and Car Fund reminders
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void loadNotifications()}
                        disabled={notificationsLoading}
                        className="text-xs font-medium text-teal-700 hover:text-teal-900
disabled:opacity-50"
                      >
                        Refresh
                      </button>
                    </div>

                    <div className="max-h-[26rem] overflow-y-auto">
                      {notificationsLoading ? (
                        <div className="p-6 text-center text-sm text-slate-500">
                          Loading notifications...
                        </div>
                      ) : notificationsError ? (
                        <div className="p-5">
                          <p className="text-sm text-red-600">
                            {notificationsError}
                          </p>

                          <button
                            type="button"
                            onClick={() => void loadNotifications()}
                            className="mt-3 text-sm font-semibold text-teal-700"
                          >
                            Try again
                          </button>
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <Bell
                            aria-hidden="true"
                            className="mx-auto h-8 w-8 text-slate-400"
                          />

                          <p className="mt-3 font-medium text-slate-800">
                            You're all caught up
                          </p>

                          <p className="mt-1 text-sm text-slate-500">
                            No current vehicle or Car Fund reminders.
                          </p>
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() =>
                              handleNotificationClick(notification)
                            }
                            className="flex w-full gap-3 border-b border-slate-100 px-4 py-4 text-left transition hover:bg-slate-50"
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
                              {getNotificationIcon(notification.type)}
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="flex items-start justify-between gap-2">
                                <span className="text-sm font-semibold text-slate-900">
                                  {notification.title}
                                </span>

                                <span
                                  className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                                    notification.priority === 'urgent'
                                      ? 'bg-red-100 text-red-700'
                                      : notification.priority === 'high'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-teal-50 text-teal-700'
                                  }`}
                                >
                                  {getPriorityLabel(notification.priority)}
                                </span>
                              </span>

                              <span className="mt-1 block text-xs leading-5 text-slate-600">
                                {notification.message}
                              </span>

                              <span className="mt-2 block text-xs text-slate-400">
                                Due {formatDate(notification.dueDate)}
                              </span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="border-t border-slate-100 px-4 py-3">
                      <p className="text-xs text-slate-500">
                        {notificationTotal} reminder
                        {notificationTotal === 1 ? '' : 's'} available.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Account menu */}
            <div className="relative">
              <button
                type="button"
                aria-label="Open account menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((current) => !current)}
                className="flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-teal-800">
                  <UserRound size={18} aria-hidden="true" />
                </span>

                <span className="hidden max-w-28 truncate text-sm font-medium sm:block">
                  {userName || 'Account'}
                </span>

                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className="hidden sm:block"
                />
              </button>

              {accountMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close account menu"
                    className="fixed inset-0 z-30 cursor-default"
                    onClick={() => setAccountMenuOpen(false)}
                  />

                  <div className="absolute right-0 z-40 mt-3 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-100 px-4 py-4">
                      <p className="truncate font-semibold text-slate-900">
                        {userName || 'Your account'}
                      </p>

                      {userEmail && (
                        <p className="mt-1 truncate text-sm text-slate-500">
                          {userEmail}
                        </p>
                      )}
                    </div>

                    <div className="p-2">
                      <Link
                        to="/profile"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-700 transition hover:bg-slate-50"
                      >
                        <UserRound size={18} aria-hidden="true" />
                        View Profile
                      </Link>

                      <Link
                        to="/settings"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-700 transition hover:bg-slate-50"
                      >
                        <Settings size={18} aria-hidden="true" />
                        Settings
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          navigate('/settings');
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                      >
                        <LogOut size={18} aria-hidden="true" />
                        Account and security
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <Link
              to="/reports/new"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl
border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition
hover:bg-slate-50"
            >
              Report an issue
            </Link>

            <Link
              to="/vehicles/new"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl
bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-
teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
            >
              <span aria-hidden="true">+</span>
              <span>Add Vehicle</span>
            </Link>
          </div>
        </header>

        {/* Global error */}
        {pageError && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-
4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-red-700">{pageError}</p>

            <button
              type="button"
              onClick={() => setPageError('')}
              className="self-start text-sm font-semibold text-red-800 sm:self-auto"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Summary cards */}
        <section aria-label="Dashboard summary">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Total Vehicles"
              value={vehiclesLoading ? '…' : totalVehicles.toLocaleString()}

              description="Active vehicles"
              icon={<CarFront aria-hidden="true" className="h-5 w-5" />}
              accent="teal"
              onClick={() => navigate('/vehicles')}
            />

            <SummaryCard
              label="Needs Attention"
              value={
                dashboardLoading
                  ? '…'
                  : dashboard
                    ? attentionCount.toLocaleString()
                    : '—'
              }
              description={
                dashboard
                  ? 'Fleet vehicles requiring attention'
                  : 'Available with fleet access'
              }
              icon={<AlertTriangle aria-hidden="true" className="h-5 w-5" />}
              accent="amber"
              onClick={() => navigate('/fleet')}
            />

            <SummaryCard
              label="Monthly Expenses"

              value={
                dashboardLoading
                  ? '…'
                  : monthlyExpenses
                    ? formatMoney(
                        monthlyExpenses.total,
                        monthlyExpenses.currency,
                      )
                    : '—'
              }
              description="Selected fleet · current month"
              icon={<CreditCard aria-hidden="true" className="h-5 w-5" />}
              accent="blue"
              onClick={() => navigate('/expenses')}
            />

            <SummaryCard
              label="New Driver Reports"
              value={
                dashboardLoading
                  ? '…'
                  : dashboard
                    ? driverReportCount.toLocaleString()
                    : '—'
              }
              description="Reports awaiting review"
              icon={<ClipboardList aria-hidden="true" className="h-5 w-5" />}

              accent="purple"
              onClick={() => navigate('/reports')}
            />
          </div>

          {!fleetsLoading && fleets.length > 0 && (
            <div
              className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200
bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-slate-900">Fleet overview</p>
                <p className="mt-1 text-sm text-slate-500">
                  Choose the fleet whose summary you want to view.
                </p>
              </div>

              <label className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
                <span className="font-medium text-slate-600">Fleet</span>

                <select
                  value={selectedFleetId}
                  onChange={(event) => setSelectedFleetId(event.target.value)}

                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-3
text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  {fleets.map((fleet) => (
                    <option key={fleet.id} value={fleet.id}>
                      {fleet.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </section>

        {/* Main dashboard grid */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Vehicles */}
          <section
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-
sm sm:p-6 xl:col-span-2"
          >
            <div
              className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-
between"
            >
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  My Vehicles
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Your active vehicles at a glance.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  to="/vehicles"
                  className="inline-flex min-h-10 items-center justify-center rounded-xl
border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition
hover:bg-slate-50"
                >
                  View All
                </Link>

                <Link
                  to="/vehicles/new"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl
bg-teal-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
                >
                  <span aria-hidden="true">+</span>
                  Add Vehicle
                </Link>
              </div>
            </div>

            {vehiclesLoading ? (
              <div className="grid gap-4 pt-6 sm:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}

                    className="h-36 animate-pulse rounded-2xl bg-slate-100"
                  />
                ))}
              </div>
            ) : displayedVehicles.length === 0 ? (
              <div
                className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-
slate-50 px-6 py-10 text-center"
              >
                <CarFront
                  aria-hidden="true"
                  className="mx-auto h-10 w-10 text-teal-700"
                />

                <h3 className="mt-3 font-semibold text-slate-900">
                  No vehicles yet
                </h3>

                <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                  Add your first vehicle to start tracking its maintenance,
                  repairs, and expenses.
                </p>

                <Link
                  to="/vehicles/new"
                  className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl
bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700"
                >
                  Add Your First Vehicle
                </Link>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {displayedVehicles.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => navigate(`/vehicles/${vehicle.id}`)}
                    className="rounded-2xl border border-slate-200 p-4 text-left transition
hover:border-teal-300 hover:bg-teal-50/30 focus:outline-none focus:ring-2 focus:ring-
teal-500"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center
rounded-xl bg-slate-100 text-xl"
                      >
                        <CarFront
                          aria-hidden="true"
                          className="h-6 w-6 text-teal-700"
                        />
                      </div>

                      <span
                        className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-
medium text-slate-600"
                      >
                        {vehicle.year}
                      </span>
                    </div>

                    <h3 className="mt-4 font-semibold text-slate-900">
                      {getVehicleName(vehicle)}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {vehicle.make} {vehicle.model}
                    </p>

                    <div
                      className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3
text-xs text-slate-500"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>Registration</span>
                        <span className="font-medium text-slate-700">
                          {vehicle.plate_number || 'Not provided'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span>Mileage</span>
                        <span className="font-medium text-slate-700">
                          {vehicle.mileage_km == null
                            ? 'Not recorded'
                            : `${vehicle.mileage_km.toLocaleString()} km`}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span>Next service</span>
                        <span className="font-medium text-slate-700">
                          {formatDate(vehicle.next_service)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!vehiclesLoading && totalVehicles > 4 && (
              <div className="mt-5 text-center">
                <Link
                  to="/vehicles"
                  className="text-sm font-semibold text-teal-700 hover:text-teal-900"
                >
                  View all {totalVehicles} vehicles{' '}
                  <ArrowRight
                    aria-hidden="true"
                    className="ml-1 inline h-4 w-4"
                  />
                </Link>
              </div>
            )}
          </section>

          {/* Car Fund */}
          <section className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">
                  YOUR SAVINGS
                </p>

                <h2 className="text-lg font-semibold text-[#F5F3E8]">Car Fund</h2>

                <p className="text-sm text-[#C7D2CE]">
                  Prepare for future vehicle costs.
                </p>
              </div>

              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-
white/10 text-xl"
              >
                <Wallet
                  aria-hidden="true"
                  className="h-6 w-6 text-teal-300"
                />
              </span>
            </div>

            {fundLoading ? (
              <div className="mt-8 space-y-3">
                <div className="h-8 w-36 animate-pulse rounded bg-white/10" />
                <div className="h-3 animate-pulse rounded-full bg-white/10" />
                <div className="h-4 w-48 animate-pulse rounded bg-white/10" />
              </div>
            ) : !carFund ? (
              <div className="mt-8">
                <p className="text-sm leading-6 text-slate-300">
                  Create a savings goal to start tracking money set aside for
                  your vehicle.
                </p>

                <Link
                  to="/car-fund"
                  className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl
bg-teal-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-400"
                >
                  Set Up Car Fund
                </Link>
              </div>
            ) : (
              <>
                <p className="mt-8 text-sm text-slate-400">Current balance</p>

                <p className="mt-1 break-words text-3xl font-bold tracking-tight">
                  {formatMoney(fundSummary?.balance ?? 0, carFund.currency)}
                </p>

                <div className="mt-6 flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-400">Savings progress</span>

                  <span className="font-semibold text-teal-300">
                    {carFundProgress.toFixed(0)}%
                  </span>
                </div>

                <div
                  className="mt-3 h-3 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-label="Car Fund savings progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={carFundProgress}
                >
                  <div
                    className="h-full rounded-full bg-teal-400 transition-all"
                    style={{
                      width: `${carFundProgress}%`,
                    }}
                  />
                </div>

                <div className="mt-3 flex flex-col gap-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">Target</span>
                    <span className="text-right font-medium">
                      {formatMoney(
                        carFund.targetAmount,

                        carFund.currency,
                      )}
                    </span>
                  </div>

                  {fundSummary?.remaining !== undefined && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Remaining</span>
                      <span className="text-right font-medium">
                        {formatMoney(fundSummary.remaining, carFund.currency)}
                      </span>
                    </div>
                  )}

                  {carFund.targetDate && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Target date</span>
                      <span className="text-right font-medium">
                        {formatDate(carFund.targetDate)}
                      </span>
                    </div>
                  )}
                </div>

                <Link
                  to="/car-fund"
                  className="mt-6 inline-flex min-h-11 w-full items-center justify-center
rounded-xl bg-teal-500 px-4 py-3 text-sm font-semibold text-slate-950 transition
hover:bg-teal-400"
                >
                  Manage Car Fund{' '}
                  <ArrowRight
                    aria-hidden="true"
                    className="ml-1 inline h-4 w-4"
                  />
                </Link>
              </>
            )}
          </section>
        </div>

        {/* Upcoming maintenance */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Upcoming Maintenance
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Keep track of the service dates recorded for your vehicles.
              </p>
            </div>

            <Link
              to="/vehicles"
              className="text-sm font-semibold text-teal-700 hover:text-teal-900"
            >
              View vehicles{' '}
              <ArrowRight aria-hidden="true" className="ml-1 inline h-4 w-4" />
            </Link>
          </div>

          {vehiclesLoading ? (
            <p className="mt-5 text-sm text-slate-500">
              Loading maintenance information...
            </p>
          ) : upcomingMaintenance.length === 0 ? (
            <div className="mt-5 rounded-2xl bg-slate-50 px-5 py-8 text-center">
              <p className="font-medium text-slate-800">
                No service dates available
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Recorded service dates will appear here when available.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              {upcomingMaintenance.map((vehicle) => (
                <button
                  key={vehicle.id}

                  type="button"
                  onClick={() => navigate(`/vehicles/${vehicle.id}`)}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4
text-left transition hover:border-teal-300 hover:bg-teal-50/30"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center
rounded-xl bg-amber-50 text-lg"
                  >
                    <Wrench
                      aria-hidden="true"
                      className="h-5 w-5 text-amber-700"
                    />
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900">
                      {getVehicleName(vehicle)}
                    </span>

                    <span className="mt-1 block text-sm text-slate-500">
                      Service date: {formatDate(vehicle.next_service)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Fleet activity */}

        {fleets.length > 0 && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Recent Driver Reports
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Review reports submitted by your drivers.
                </p>
              </div>

              <Link
                to="/reports"
                className="text-sm font-semibold text-teal-700 hover:text-teal-900"
              >
                View reports{' '}
                <ArrowRight
                  aria-hidden="true"
                  className="ml-1 inline h-4 w-4"
                />
              </Link>
            </div>

            {dashboardLoading ? (
              <p className="mt-5 text-sm text-slate-500">
                Loading driver reports...
              </p>
            ) : !dashboard || dashboard.newDriverReports.recent.length === 0 ? (
              <div className="mt-5 rounded-2xl bg-slate-50 px-5 py-8 text-center">
                <p className="font-medium text-slate-800">
                  No new driver reports
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  New reports will appear here when drivers submit them.
                </p>
              </div>
            ) : (
              <div className="mt-5 divide-y divide-slate-100">
                {dashboard.newDriverReports.recent.map((report) => (
                  <div
                    key={report.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {report.category.replace(/_/g, ' ')}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        {report.description ||
                          'No additional description provided.'}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        Reported {formatDate(report.createdAt)}
                      </p>
                    </div>

                    <span className="self-start rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold capitalize text-amber-700">
                      {report.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </AppPageLayout>
  );
}

/* Summary card */

interface SummaryCardProps {
  label: string;

  value: string;
  description: string;
  icon: ReactNode;
  accent: 'teal' | 'amber' | 'blue' | 'purple';
  onClick: () => void;
}

function SummaryCard({
  label,
  value,
  description,
  icon,
  accent,
  onClick,
}: SummaryCardProps) {
  const accentClasses = {
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
  };

  return (
    <button
      type="button"
      onClick={onClick}

      className="group rounded-2xl border border-slate-200 bg-white p-5 text-left
shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md
focus:outline-none focus:ring-2 focus:ring-teal-500"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>

          <p className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {value}
          </p>
        </div>

        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${accentClasses[accent]}`}
        >
          {icon}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs leading-5 text-slate-500">{description}</p>

        <span className="text-slate-400 transition group-hover:translate-x-1 group-hover:text-teal-700">
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
}
