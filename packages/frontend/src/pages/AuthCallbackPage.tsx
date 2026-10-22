import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signInWithToken } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const token = params.get("token");
    if (!token) {
      navigate("/login?error=server_error", { replace: true });
      return;
    }
    void signInWithToken(token).then(() => navigate("/", { replace: true }));
  }, [params, navigate, signInWithToken]);

  return (
    <div className="flex min-h-full items-center justify-center text-muted">Signing you in…</div>
  );
}
