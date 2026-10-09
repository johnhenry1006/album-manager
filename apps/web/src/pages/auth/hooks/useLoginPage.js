import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useAuth } from '@/features/auth/index.js';
export function useLoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await auth.login({ email, password });
      const path = location.state?.returnTo;
      navigate(
        typeof path === 'string' &&
          /^\/(?!\/)/.test(path) &&
          !/[\\\s]/.test(path) &&
          !path.startsWith('/login')
          ? path
          : '/dashboard',
        { replace: true },
      );
    } catch {
      setError('Sign in failed. Check your email and password and try again.');
    } finally {
      setPending(false);
    }
  }
  return { email, setEmail, password, setPassword, pending, error, submit };
}
