import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loading } from "./states";

/* Gate for signed-in routes. Optional `roles` limits a route to some roles
   (the admin pages). RLS enforces the same rule on the server; this only
   avoids rendering a page that would come back empty. */
export default function ProtectedRoute({ children, roles }) {
  const { session, role, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return <div className="se" style={{ display: "grid", placeItems: "center" }}><Loading /></div>;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: loc }} />;
  }

  if (roles && role && !roles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
