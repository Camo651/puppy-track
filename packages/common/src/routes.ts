export const API_PREFIX = "/api";

export const API_ROUTES = {
  HEALTH: `${API_PREFIX}/health`,

  AUTH_DISCORD_LOGIN: `${API_PREFIX}/auth/discord/login`,
  AUTH_DISCORD_CALLBACK: `${API_PREFIX}/auth/discord/callback`,
  AUTH_ME: `${API_PREFIX}/auth/me`,
  AUTH_LOGOUT: `${API_PREFIX}/auth/logout`,

  PUPPY: `${API_PREFIX}/puppy`,

  EVENTS: `${API_PREFIX}/events`,
  event: (id: string) => `${API_PREFIX}/events/${id}`,

  PREDICTIONS: `${API_PREFIX}/predictions`,
  predictionFeedback: (id: string) => `${API_PREFIX}/predictions/${id}/feedback`,

  MODELS: `${API_PREFIX}/models`,
  MODELS_CHAMPION: `${API_PREFIX}/models/champion`,
  modelPredictions: (id: string) => `${API_PREFIX}/models/${id}/predictions`,

  PUSH_VAPID_PUBLIC_KEY: `${API_PREFIX}/push/vapid-public-key`,
  PUSH_SUBSCRIBE: `${API_PREFIX}/push/subscribe`,
  PUSH_UNSUBSCRIBE: `${API_PREFIX}/push/unsubscribe`,
  PUSH_TEST: `${API_PREFIX}/push/test`,
} as const;
