import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './components/auth/AdminRoute';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { AuthLayout } from './components/layout/AuthLayout';
import { PublicLayout } from './components/layout/PublicLayout';

// Auth
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import OAuthCallbackPage from './pages/auth/OAuthCallbackPage';
import ProfilePage from './pages/auth/ProfilePage';
// Business profile
import OnboardingPage from './pages/onboarding/OnboardingPage';
import SettingsPage from './pages/settings/SettingsPage';
// Customers
import CustomersPage from './pages/customers/CustomersPage';
import CustomerCreatePage from './pages/customers/CustomerCreatePage';
import CustomerDetailPage from './pages/customers/CustomerDetailPage';
import CustomerEditPage from './pages/customers/CustomerEditPage';
// Billing plans
import PlansPage from './pages/plans/PlansPage';
import PlanCreatePage from './pages/plans/PlanCreatePage';
import PlanDetailPage from './pages/plans/PlanDetailPage';
import PlanEditPage from './pages/plans/PlanEditPage';
// Bills
import BillsPage from './pages/bills/BillsPage';
import BillCreatePage from './pages/bills/BillCreatePage';
import BillDetailPage from './pages/bills/BillDetailPage';
import BillEditPage from './pages/bills/BillEditPage';
import PublicBillPage from './pages/public/PublicBillPage';
// Payments
import PaymentsPage from './pages/payments/PaymentsPage';
// Dashboard
import DashboardPage from './pages/dashboard/DashboardPage';
// Admin
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
// Fallback
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      {/* Unauthenticated auth flows */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      </Route>

      {/* Public bill view (no auth, no app shell) */}
      <Route element={<PublicLayout />}>
        <Route path="/pay/:publicToken" element={<PublicBillPage />} />
      </Route>

      {/* Authenticated */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Route>

        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />

          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/new" element={<CustomerCreatePage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/customers/:id/edit" element={<CustomerEditPage />} />

          <Route path="/plans" element={<PlansPage />} />
          <Route path="/plans/new" element={<PlanCreatePage />} />
          <Route path="/plans/:id" element={<PlanDetailPage />} />
          <Route path="/plans/:id/edit" element={<PlanEditPage />} />

          <Route path="/bills" element={<BillsPage />} />
          <Route path="/bills/new" element={<BillCreatePage />} />
          <Route path="/bills/:id" element={<BillDetailPage />} />
          <Route path="/bills/:id/edit" element={<BillEditPage />} />

          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />

          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
