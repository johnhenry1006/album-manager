import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { httpClient } from '@/services/httpClient.js';

import { authApi } from '../api/authApi.js';
import { authQueryKeys } from '../api/authQueryKeys.js';
export function useAuthSession() {
  const client = useQueryClient();
  const version = useRef(0);
  const session = useRef(null);
  const mounted = useRef(false);
  const transitioning = useRef(false);
  const invalidate = useCallback(() => ++version.current, []);
  const [state, setState] = useState({ status: 'loading', user: null, error: null });
  const clear = useCallback(async () => {
    await client.cancelQueries();
    client.clear();
  }, [client]);
  const expire = useCallback(() => {
    invalidate();
    session.current = null;
    if (mounted.current) setState({ status: 'signedOut', user: null, error: null });
    void clear();
  }, [clear, invalidate]);
  const accept = useCallback((data) => {
    if (
      !data?.user ||
      typeof data.user.id !== 'string' ||
      typeof data.user.email !== 'string' ||
      typeof data.csrfToken !== 'string'
    )
      throw new Error('Invalid authentication response');
    session.current = data;
    setState({ status: 'authenticated', user: data.user, error: null });
  }, []);
  const refresh = useCallback(async () => {
    if (transitioning.current) return;
    let current = version.current;
    try {
      const data = await client.fetchQuery({
        queryKey: authQueryKeys.session(current),
        queryFn: ({ signal }) => authApi.me({ signal }),
        staleTime: 0,
        retry: false,
      });
      if (!mounted.current || current !== version.current) return;
      if (session.current && data.user?.id !== session.current.user.id) {
        current = invalidate();
        session.current = null;
        setState({ status: 'loading', user: null, error: null });
        await clear();
      }
      if (mounted.current && current === version.current) accept(data);
    } catch (error) {
      if (!mounted.current || current !== version.current) return;
      if (error.status === 401) expire();
      else
        setState((previous) => ({
          ...previous,
          status: previous.user ? 'authenticated' : 'error',
          error,
        }));
    }
  }, [client, clear, accept, expire, invalidate]);
  useEffect(() => {
    mounted.current = true;
    const remove = httpClient.configureRequestContext({
      getVersion: () => version.current,
      getHeaders: () => (session.current ? { 'X-CSRF-Token': session.current.csrfToken } : {}),
      onUnauthorized: ({ path }) => {
        if (!/^\/?auth\/(?:login|me)$/.test(path)) expire();
      },
    });
    void refresh();
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      mounted.current = false;
      invalidate();
      remove();
      window.removeEventListener('focus', focus);
    };
  }, [refresh, expire, invalidate]);
  const login = useCallback(
    async (credentials) => {
      const current = invalidate();
      transitioning.current = true;
      session.current = null;
      setState({ status: 'loading', user: null, error: null });
      try {
        await clear();
        const data = await authApi.login(credentials);
        if (mounted.current && current === version.current) accept(data);
      } catch (error) {
        if (mounted.current && current === version.current)
          setState({ status: 'signedOut', user: null, error: null });
        throw error;
      } finally {
        transitioning.current = false;
      }
    },
    [clear, accept, invalidate],
  );
  const logout = useCallback(async () => {
    invalidate();
    transitioning.current = true;
    try {
      await authApi.logout();
      expire();
      await clear();
    } finally {
      transitioning.current = false;
    }
  }, [expire, clear, invalidate]);
  return { ...state, login, logout, retry: refresh };
}
