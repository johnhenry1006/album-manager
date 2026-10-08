import { QueryProvider } from './QueryProvider.jsx';

export function AppProviders({ children }) {
  return <QueryProvider>{children}</QueryProvider>;
}
