import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function AuthGuard({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
