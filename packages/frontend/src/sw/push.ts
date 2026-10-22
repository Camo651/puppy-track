import { api } from "@/api/client";

export const isPushSupported = (): boolean =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const isStandalone = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // iOS Safari exposes standalone mode through a non-standard navigator flag.
  (navigator as unknown as { standalone?: boolean }).standalone === true;

const urlBase64ToUint8Array = (base64String: string): Uint8Array<ArrayBuffer> => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
};

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | undefined> => {
  if (!("serviceWorker" in navigator)) return undefined;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return undefined;
  }
};

export const isPushSubscribed = async (): Promise<boolean> => {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
};

export const enablePush = async (): Promise<boolean> => {
  if (!isPushSupported()) throw new Error("Push notifications are not supported on this device");

  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted");

  const publicKey = await api.vapidPublicKey();
  if (!publicKey) throw new Error("Push notifications are not configured on the server");

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await api.subscribePush(sub.toJSON() as never);
  return true;
};

export const disablePush = async (): Promise<void> => {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api.unsubscribePush(sub.endpoint);
  await sub.unsubscribe().catch(() => {});
};
