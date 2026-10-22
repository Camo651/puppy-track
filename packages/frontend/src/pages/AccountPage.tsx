import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import {
  disablePush,
  enablePush,
  isPushSubscribed,
  isPushSupported,
  isStandalone,
} from "@/sw/push";

export function AccountPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const supported = isPushSupported();
  const standalone = isStandalone();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void isPushSubscribed().then(setSubscribed);
  }, []);

  const toggle = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
      } else {
        await enablePush();
        setSubscribed(true);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (!subscribed) {
        await enablePush();
        setSubscribed(true);
      }
      const res = await api.testPush();
      setMessage(res.sent > 0 ? `Sent to ${res.sent} device(s).` : "No subscribed devices found.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <div className="mb-2 text-sm font-semibold text-muted">Account</div>
        <p className="text-sm">
          Signed in as <span className="font-semibold">{user?.globalName || user?.username}</span>
        </p>
        <button className="btn-ghost mt-3 w-full" onClick={() => void signOut()}>
          Sign out
        </button>
      </section>

      <section className="card p-4">
        <div className="mb-2 text-sm font-semibold text-muted">Notifications</div>

        {!supported && (
          <div className="rounded-field bg-brand-soft p-3 text-sm">
            This browser can't receive notifications yet.
            <ul className="mt-2 list-disc pl-5">
              <li>
                <b>iPhone / iPad:</b> open Puppy Track in Safari, tap the Share button, choose{" "}
                <b>Add to Home Screen</b>, then open it from the new icon and enable notifications
                here.
              </li>
              <li>
                <b>Android:</b> open in Chrome and enable notifications here.
              </li>
            </ul>
          </div>
        )}

        {supported && !standalone && (
          <div className="mb-3 rounded-field bg-brand-soft p-3 text-sm">
            On iPhone, notifications only work when Puppy Track is installed to the Home Screen
            (Share → Add to Home Screen) and opened from there.
          </div>
        )}

        {supported && (
          <div className="flex items-center justify-between">
            <span className="font-medium">Push notifications</span>
            <button className="btn-brand px-4 py-2" onClick={toggle} disabled={busy}>
              {busy ? "…" : subscribed ? "Turn off" : "Turn on"}
            </button>
          </div>
        )}

        {supported && (
          <button className="btn-ghost mt-3 w-full" onClick={test} disabled={busy}>
            Send test notification
          </button>
        )}

        {message && <p className="mt-3 text-sm text-muted">{message}</p>}
      </section>

      <section className="card p-4">
        <div className="mb-2 text-sm font-semibold text-muted">Predictions</div>
        <button className="btn-ghost w-full" onClick={() => navigate("/models")}>
          Model Lab
        </button>
      </section>
    </div>
  );
}
