import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, json, problem } from '../test/fake-api';
import { SignInPage } from './AuthPages';

function renderSignIn(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <SignInPage /> },
      { path: '*', element: <p>Landed</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

async function signIn() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'ana@checkpoint.test');
  await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('SignInPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns to the page the visitor came from', async () => {
    fakeApi({
      'POST /api/v1/auth/login': () =>
        json(200, { accessToken: 'a', tokenType: 'Bearer', expiresIn: 900 }),
      'GET /api/v1/auth/me': () =>
        json(200, {
          id: '1',
          email: 'ana@checkpoint.test',
          username: 'demo_ana',
          role: 'USER',
          createdAt: '2026-10-01T00:00:00.000Z',
        }),
    });
    const router = renderSignIn('/sign-in?from=%2Fgames%2Fhades');

    await signIn();

    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/games/hades');
    });
  });

  it('never redirects to another site through ?from=', async () => {
    fakeApi({
      'POST /api/v1/auth/login': () =>
        json(200, { accessToken: 'a', tokenType: 'Bearer', expiresIn: 900 }),
      'GET /api/v1/auth/me': () =>
        json(200, {
          id: '1',
          email: 'ana@checkpoint.test',
          username: 'demo_ana',
          role: 'USER',
          createdAt: '2026-10-01T00:00:00.000Z',
        }),
    });
    const router = renderSignIn('/sign-in?from=%2F%2Fevil.example%2Fphish');

    await signIn();

    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('shows the generic API message and its request id when the login fails', async () => {
    fakeApi({
      'POST /api/v1/auth/login': () => problem(401, 'Invalid email or password.', 'req-9'),
    });
    renderSignIn('/sign-in');

    await signIn();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Invalid email or password.');
    expect(alert.textContent).toContain('req-9');
  });

  it('validates the fields before calling the API', async () => {
    const calls = fakeApi({});
    renderSignIn('/sign-in');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter your email address.')).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    expect(calls).toEqual([]);
  });
});
