import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { GuestRoute, ProtectedRoute, RoleProtectedRoute } from "./components/auth/ProtectedRoute";
import { AuthProvider } from "./context/AuthProvider";
import { DriverLayout } from "./layouts/DriverLayout";
import { OperatorLayout } from "./layouts/OperatorLayout";
import { PlannerLayout } from "./layouts/PlannerLayout";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AuthCallbackPage } from "./pages/auth/AuthCallbackPage";
import { DriverSignupPage } from "./pages/auth/DriverSignupPage";
import { OperatorSignupPage } from "./pages/auth/OperatorSignupPage";
import { ForbiddenPage } from "./pages/auth/ForbiddenPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { PlannerPendingPage } from "./pages/auth/PlannerPendingPage";
import { PlannerSignupPage } from "./pages/auth/PlannerSignupPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { RoleSelectPage } from "./pages/auth/RoleSelectPage";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage";
import { BookingPage } from "./pages/driver/BookingPage";
import { BookingsPage } from "./pages/driver/BookingsPage";
import { ChargerDetailsPage } from "./pages/driver/ChargerDetailsPage";
import { ChargingWindowPage } from "./pages/driver/ChargingWindowPage";
import { DriverHomePage } from "./pages/driver/DriverHomePage";
import { DriverSavingsPage } from "./pages/driver/DriverSavingsPage";
import { FastTrackPage } from "./pages/driver/FastTrackPage";
import { PlannerBuildPlanPage } from "./pages/planner/PlannerBuildPlanPage";
import { PlannerConsiderationPage } from "./pages/planner/PlannerConsiderationPage";
import { PlannerDashboardPage } from "./pages/planner/PlannerDashboardPage";
import { PlannerExplorerPage } from "./pages/planner/PlannerExplorerPage";
import { PlannerGridPage } from "./pages/planner/PlannerGridPage";
import { PlannerReportsPage } from "./pages/planner/PlannerReportsPage";
import { PlannerSiteDetailsPage } from "./pages/planner/PlannerSiteDetailsPage";
import { OperatorDashboardPage } from "./pages/operator/OperatorDashboardPage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/"
            element={
              <GuestRoute>
                <RoleSelectPage />
              </GuestRoute>
            }
          />
          <Route path="/get-started" element={<Navigate to="/" replace />} />
          <Route
            path="/login"
            element={
              <GuestRoute>
                <LoginPage />
              </GuestRoute>
            }
          />
          <Route path="/signup" element={<Navigate to="/" replace />} />
          <Route
            path="/signup/planner"
            element={
              <GuestRoute>
                <PlannerSignupPage />
              </GuestRoute>
            }
          />
          <Route
            path="/signup/driver"
            element={
              <GuestRoute>
                <DriverSignupPage />
              </GuestRoute>
            }
          />
          <Route
            path="/signup/operator"
            element={
              <GuestRoute>
                <OperatorSignupPage />
              </GuestRoute>
            }
          />
          <Route
            path="/planner-pending"
            element={
              <ProtectedRoute>
                <PlannerPendingPage />
              </ProtectedRoute>
            }
          />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/forgot-password"
            element={
              <GuestRoute>
                <ForgotPasswordPage />
              </GuestRoute>
            }
          />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/forbidden"
            element={
              <ProtectedRoute>
                <ForbiddenPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <RoleProtectedRoute role="admin">
                <AdminDashboardPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/planner"
            element={
              <RoleProtectedRoute role="planner">
                <PlannerLayout />
              </RoleProtectedRoute>
            }
          >
            <Route index element={<PlannerDashboardPage />} />
            <Route path="explorer" element={<PlannerExplorerPage />} />
            <Route path="grid" element={<PlannerGridPage />} />
            <Route path="plan" element={<PlannerBuildPlanPage />} />
            <Route path="consideration" element={<PlannerConsiderationPage />} />
            <Route path="reports" element={<PlannerReportsPage />} />
            <Route path="site/:siteId" element={<PlannerSiteDetailsPage />} />
          </Route>
          <Route
            path="/operator"
            element={
              <RoleProtectedRoute role="operator">
                <OperatorLayout />
              </RoleProtectedRoute>
            }
          >
            <Route index element={<OperatorDashboardPage />} />
          </Route>
          <Route
            path="/driver"
            element={
              <RoleProtectedRoute role="driver">
                <DriverLayout />
              </RoleProtectedRoute>
            }
          >
            <Route index element={<DriverHomePage />} />
            <Route path="savings" element={<DriverSavingsPage />} />
            <Route path="bookings" element={<BookingsPage />} />
            <Route path="charger/:chargerId" element={<ChargerDetailsPage />} />
            <Route path="charger/:chargerId/book" element={<ChargingWindowPage />} />
            <Route path="booking/:bookingId" element={<BookingPage />} />
            <Route path="fast-track" element={<FastTrackPage />} />
          </Route>
          <Route
            path="/charger/:chargerId"
            element={
              <RoleProtectedRoute role="driver">
                <DriverLayout />
              </RoleProtectedRoute>
            }
          >
            <Route index element={<FastTrackPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
