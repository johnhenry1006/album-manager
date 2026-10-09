import { AuthProvider } from '@/features/auth/index.js';

import { QueryProvider } from './QueryProvider.jsx';

export function AppProviders({ children }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}
