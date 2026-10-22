import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateEventInput, UpdateEventInput } from "@puppy-track/common";
import { api } from "@/api/client";

export function usePuppy() {
  return useQuery({ queryKey: ["puppy"], queryFn: api.getPuppy, staleTime: Infinity });
}

export function useEvents(params?: { since?: number; type?: string; limit?: number }) {
  return useQuery({
    queryKey: ["events", params ?? {}],
    queryFn: () => api.listEvents(params),
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) => api.createEvent(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: ["predictions"] });
    },
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEventInput }) =>
      api.updateEvent(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: ["predictions"] });
    },
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteEvent(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function usePredictions(limit = 50) {
  return useQuery({
    queryKey: ["predictions", limit],
    queryFn: () => api.listPredictions(limit),
    refetchInterval: 60_000,
  });
}

export function usePredictionFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, happened }: { id: string; happened: boolean }) =>
      api.predictionFeedback(id, happened),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["predictions"] }),
  });
}

export function useModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: api.listModels,
    refetchInterval: 60_000,
  });
}

export function useSetChampion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modelId: string) => api.setChampion(modelId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["models"] });
      void qc.invalidateQueries({ queryKey: ["predictions"] });
    },
  });
}
