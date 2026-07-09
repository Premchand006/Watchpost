import { Routes, Route, Navigate } from "react-router-dom";
import { isConfigured } from "./lib/supabase";
import ConfigNeeded from "./auth/ConfigNeeded";
import Login from "./auth/Login";
import Signup from "./auth/Signup";
import ProtectedRoute from "./components/ProtectedRoute";
import { DataProvider } from "./context/DataContext";
import Shell from "./components/Shell";
import CommandView from "./views/CommandView";
import LiveWallView from "./views/LiveWallView";
import RosterView from "./views/RosterView";
import AlertsView from "./views/AlertsView";
import AnalyticsView from "./views/AnalyticsView";
import AuditView from "./views/AuditView";
import UsersView from "./views/UsersView";

/* The signed-in app shares one set of realtime subscriptions through
   DataProvider, mounted inside the protected route. */
function AppShell() {
  return (
    <ProtectedRoute>
      <DataProvider>
        <Shell />
      </DataProvider>
    </ProtectedRoute>
  );
}

export default function App() {
  if (!isConfigured) return <ConfigNeeded />;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route element={<AppShell />}>
        <Route path="/" element={<CommandView />} />
        <Route path="/live" element={<LiveWallView />} />
        <Route path="/people" element={<RosterView />} />
        <Route path="/alerts" element={<AlertsView />} />
        <Route path="/analytics" element={<AnalyticsView />} />
        <Route path="/audit" element={
          <ProtectedRoute roles={["admin"]}><AuditView /></ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute roles={["admin"]}><UsersView /></ProtectedRoute>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
