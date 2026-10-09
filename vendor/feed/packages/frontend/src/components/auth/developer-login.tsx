import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import config from '@/config/config';

export function DeveloperLogin() {
  const apiBase = (import.meta.env.VITE_API_BASE_URL || config.api.baseUrl).replace(/\/$/, '');
  const { checkSession } = useAuth();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/api/auth/developer-login/status`, { credentials: 'include', signal: controller.signal })
      .then(async response => { if (response.ok) setEnabled((await response.json()).enabled === true); })
      .catch(() => {});
    return () => controller.abort();
  }, [apiBase]);

  async function signIn() {
    setPending(true);
    setError('');
    try {
      const response = await fetch(`${apiBase}/api/auth/developer-login`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Developer sign-in could not be completed.');
      await checkSession();
      navigate('/', { replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Developer sign-in could not be completed.');
    } finally {
      setPending(false);
    }
  }

  if (!enabled) return null;
  return (
    <section aria-label="Local development sign-in" className="mb-6 space-y-2 border-b pb-6">
      <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={() => void signIn()}>
        {pending ? 'Signing in…' : 'Sign in as developer'}
      </Button>
      <p className="text-xs text-muted-foreground text-center">Local development only. No email or OTP required. Administrator session expires in one hour.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
