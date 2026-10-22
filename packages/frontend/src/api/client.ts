import {
  API_ROUTES,
  type CreateEventInput,
  type ModelInfo,
  type Prediction,
  type PushSubscriptionJSON,
  type PuppyEvent,
  type PuppyProfile,
  type UpdateEventInput,
  type User,
} from "@puppy-track/common";
import { apiGet, apiSend } from "./http";

export const api = {
  me: () => apiGet<{ user: User }>(API_ROUTES.AUTH_ME).then((r) => r.user),
  logout: () => apiSend<{ ok: boolean }>(API_ROUTES.AUTH_LOGOUT, "POST"),

  getPuppy: () => apiGet<{ puppy: PuppyProfile }>(API_ROUTES.PUPPY).then((r) => r.puppy),

  listEvents: (params?: { since?: number; type?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.since) q.set("since", String(params.since));
    if (params?.type) q.set("type", params.type);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return apiGet<{ events: PuppyEvent[] }>(`${API_ROUTES.EVENTS}${qs ? `?${qs}` : ""}`).then(
      (r) => r.events,
    );
  },
  createEvent: (input: CreateEventInput) =>
    apiSend<{ event: PuppyEvent }>(API_ROUTES.EVENTS, "POST", input).then((r) => r.event),
  updateEvent: (id: string, input: UpdateEventInput) =>
    apiSend<{ event: PuppyEvent }>(API_ROUTES.event(id), "PATCH", input).then((r) => r.event),
  deleteEvent: (id: string) => apiSend<{ ok: boolean }>(API_ROUTES.event(id), "DELETE"),

  listPredictions: (limit = 50) =>
    apiGet<{ predictions: Prediction[] }>(`${API_ROUTES.PREDICTIONS}?limit=${limit}`).then(
      (r) => r.predictions,
    ),
  predictionFeedback: (id: string, happened: boolean) =>
    apiSend<{ prediction: Prediction }>(API_ROUTES.predictionFeedback(id), "POST", { happened }).then(
      (r) => r.prediction,
    ),

  listModels: () => apiGet<{ models: ModelInfo[] }>(API_ROUTES.MODELS).then((r) => r.models),
  setChampion: (modelId: string) =>
    apiSend<{ champion: string }>(API_ROUTES.MODELS_CHAMPION, "POST", { modelId }).then(
      (r) => r.champion,
    ),
  listModelPredictions: (id: string, limit = 30) =>
    apiGet<{ predictions: Prediction[] }>(`${API_ROUTES.modelPredictions(id)}?limit=${limit}`).then(
      (r) => r.predictions,
    ),

  vapidPublicKey: () =>
    apiGet<{ publicKey: string }>(API_ROUTES.PUSH_VAPID_PUBLIC_KEY).then((r) => r.publicKey),
  subscribePush: (sub: PushSubscriptionJSON) => apiSend(API_ROUTES.PUSH_SUBSCRIBE, "POST", sub),
  unsubscribePush: (endpoint: string) =>
    apiSend(API_ROUTES.PUSH_UNSUBSCRIBE, "POST", { endpoint }),
  testPush: () => apiSend<{ ok: boolean; sent: number }>(API_ROUTES.PUSH_TEST, "POST"),
};
