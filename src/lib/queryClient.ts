import { QueryClient } from '@tanstack/react-query';

// Create a client with default settings
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data will be considered fresh for 5 minutes (300000ms) by default
      staleTime: 5 * 60 * 1000,
      // Keep unused data in cache for 10 minutes
      gcTime: 10 * 60 * 1000,
      // Retry failed queries 3 times with exponential backoff
      retry: 3,
      // Start showing loading state only after 500ms to avoid UI flicker on fast connections
      refetchOnWindowFocus: true, // ENABLED: This will auto-refresh stale data when window regains focus
      // Use our own error handling
      useErrorBoundary: false,
    },
  },
});