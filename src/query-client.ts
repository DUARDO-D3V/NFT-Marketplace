import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

export const sessionQueryKey = ["session"] as const;

// Cache policy (documented in ARCHITECTURE.md):
// - staleTime 30s; no refetch on window focus (realtime events + reconnect reconcile instead).
// - queries retry once for transient failures; 4xx errors are never retried.
// - a 401 from any query or mutation drops the cached session so guarded routes re-evaluate.
const isUnauthorized = (error: unknown) => isAxiosError(error) && error.response?.status === 401;

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isUnauthorized(error) && query.queryKey[0] !== "session") queryClient.setQueryData(sessionQueryKey, null);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (isUnauthorized(error) && mutation.options.mutationKey?.[0] !== "sign-in") queryClient.setQueryData(sessionQueryKey, null);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = isAxiosError(error) ? error.response?.status : undefined;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
    },
    mutations: { retry: false },
  },
});
