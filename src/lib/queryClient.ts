import { QueryClient } from '@tanstack/react-query';
import { AuthError, NetworkError } from './errors';
import { toast } from 'react-toastify';
import { supabase } from './supabaseClient';

// Store for global auth error handlers
const authErrorHandlers: Array<() => void> = [];

// Register a global auth error handler
export const registerAuthErrorHandler = (handler: () => void) => {
  authErrorHandlers.push(handler);
};

// Trigger all registered auth error handlers
export const handleAuthError = async () => {
  console.log('Global auth error handling triggered');
  
  // Attempt to sign out from Supabase
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('Error signing out during auth error handling:', err);
  }
  
  // Call all registered handlers
  for (const handler of authErrorHandlers) {
    try {
      handler();
    } catch (error) {
      console.error('Error in auth error handler:', error);
    }
  }
  
  // Show toast message
  toast.error(
    'Your session has expired. Please sign in again.',
    { autoClose: 5000 }
  );
  
  // Redirect to login
  window.location.href = '/login';
};

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
      // Global error handler for auth errors
      onError: (error) => {
        console.error('Query error:', error);
        
        // If this is an auth error, trigger the global auth error handling
        if (error instanceof AuthError) {
          handleAuthError();
        } else if (error instanceof NetworkError) {
          // For network errors, just show a toast but don't log out
          toast.warning('Network connection issue detected. Some features may be limited.', {
            autoClose: false // Keep visible until dismissed
          });
        }
      },
    },
    mutations: {
      // Global error handler for mutations
      onError: (error) => {
        console.error('Mutation error:', error);
        
        // If this is an auth error, trigger the global auth error handling
        if (error instanceof AuthError) {
          handleAuthError();
        }
      },
    }
  },
});