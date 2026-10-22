import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

const ERRORS: Record<string, string> = {
  not_allowed: "That Discord account isn't on the allow-list for this puppy.",
  token_exchange_failed: "Discord sign-in failed. Please try again.",
  user_fetch_failed: "Couldn't read your Discord profile. Please try again.",
  missing_code: "Sign-in was cancelled.",
  server_error: "Something went wrong. Please try again.",
};

export function LoginPage() {
  const { loginUrl } = useAuth();
  const [params] = useSearchParams();
  const error = params.get("error");

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-6xl">🐶</div>
      <div>
        <h1 className="text-2xl font-bold">Puppy Track</h1>
      </div>

      {error && (
        <div className="w-full max-w-sm rounded-field bg-brand-soft p-3 text-sm">
          {ERRORS[error] ?? "Sign-in failed. Please try again."}
        </div>
      )}

      <a href={loginUrl} className="btn-brand w-full max-w-sm py-3 text-lg">
        Continue with Discord
      </a>
      <p className="max-w-sm text-xs text-muted">
        Access is limited to approved accounts.
      </p>
    </div>
  );
}
