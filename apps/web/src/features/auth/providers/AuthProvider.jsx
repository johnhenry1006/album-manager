import { AuthContext } from '../hooks/authContext.js';
import { useAuthSession } from '../hooks/useAuthSession.js';
export function AuthProvider({ children }) {
  const auth = useAuthSession();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
