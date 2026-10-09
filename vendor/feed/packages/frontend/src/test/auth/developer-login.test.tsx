import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeveloperLogin } from '@/components/auth/developer-login';

const { checkSession, navigate } = vi.hoisted(() => ({ checkSession: vi.fn(), navigate: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ checkSession }) }));
vi.mock('react-router-dom', async importOriginal => ({ ...(await importOriginal<typeof import('react-router-dom')>()), useNavigate: () => navigate }));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  checkSession.mockReset().mockResolvedValue(undefined);
  navigate.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const renderLogin = () => render(<MemoryRouter><DeveloperLogin /></MemoryRouter>);

describe('developer sign-in button', () => {
  it('stays hidden when the server disables it', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ enabled: false }));
    renderLogin();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Sign in as developer' })).not.toBeInTheDocument();
  });
  it('stays hidden when availability cannot be checked', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    renderLogin();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Sign in as developer' })).not.toBeInTheDocument();
  });
  it('posts explicitly, refreshes the real session, and enters the dashboard', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ enabled: true })).mockResolvedValueOnce(response({ success: true }));
    renderLogin();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in as developer' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(checkSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenLastCalledWith('/feed/api/auth/developer-login', expect.objectContaining({ method: 'POST', credentials: 'include', body: '{}', headers: { 'Content-Type': 'application/json' } }));
  });
  it('shows a refusal and does not navigate or pretend authentication succeeded', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ enabled: true })).mockResolvedValueOnce(response({ error: { message: 'Developer sign-in is disabled.' } }, 404));
    renderLogin();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in as developer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Developer sign-in is disabled.');
    expect(checkSession).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
