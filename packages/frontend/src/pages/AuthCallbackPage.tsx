import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function AuthCallbackPage() {
  const navigate = useNavigate();

  // The backend sets the session cookie and redirects straight to "/", so this
  // route is only a fallback for older links. The session is already active, so
  // just send the user home where RequireAuth resolves it.
  useEffect(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-full items-center justify-center text-muted">Signing you in…</div>
  );
}
