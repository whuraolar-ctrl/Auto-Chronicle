import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
const AcceptInvitationPage = lazy(() => import('./pages/AcceptInvitationPage'));
const AddVehiclePage = lazy(() => import('./pages/AddVehiclePage'));
const CarFundPage = lazy(() => import('./pages/CarFundPage'));
const CompleteProfilePage = lazy(() => import('./pages/CompleteProfilePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const CreateAccountPage = lazy(() => import('./pages/CreateAccountPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const FleetManagementPage = lazy(() => import('./pages/FleetManagementPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const IssueReportPage = lazy(() => import('./pages/IssueReportPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const RepairsPage = lazy(() => import('./pages/RepairsPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const VehicleDetailPage = lazy(() => import('./pages/VehicleDetailPage'));
const VehiclesPage = lazy(() => import('./pages/VehiclesPage'));
const WelcomePage = lazy(() => import('./pages/WelcomePage'));

function App() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div
            role="status"
            className="flex min-h-screen items-center justify-center text-sm text-[#74847e]"
          >
            Loading page...
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/create-account" element={<CreateAccountPage />} />
          <Route path="/register" element={<CreateAccountPage />} />

          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/complete-profile" element={<CompleteProfilePage />} />
          <Route
            path="/fleet-invitations/accept"
            element={<AcceptInvitationPage />}
          />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/vehicles/new" element={<AddVehiclePage />} />
          <Route path="/vehicles/:vehicleId" element={<VehicleDetailPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/new" element={<IssueReportPage />} />
          <Route path="/fleet" element={<FleetManagementPage />} />
          <Route path="/car-fund" element={<CarFundPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route
            path="/vehicles/:vehicleId/repairs/new"
            element={<RepairsPage />}
          />
          <Route
            path="/vehicles/:vehicleId/reports/new"
            element={<IssueReportPage />}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
