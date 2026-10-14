import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../api/api-error';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { useDocumentTitle } from '../lib/use-document-title';
import { session } from '../session/session-store';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9_]{3,24}$/;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;

// Only same-site paths: an absolute URL in ?from= would turn sign-in into an open redirect.
function useReturnPath(): string {
  const [params] = useSearchParams();
  const from = params.get('from') ?? '/';
  return from.startsWith('/') && !from.startsWith('//') ? from : '/';
}

function AuthCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  useDocumentTitle(title);
  return (
    <div className="mx-auto mt-8 w-full max-w-sm rounded-card border border-border bg-surface p-6">
      <h1 className="mb-6 text-lg">{title}</h1>
      {children}
      <p className="mt-6 text-sm text-muted">{footer}</p>
    </div>
  );
}

function FormError({ error }: { error: ApiError | null }) {
  if (error === null) {
    return null;
  }
  return (
    <div role="alert" className="rounded-control border border-danger/40 p-3 text-sm">
      <p>{error.message}</p>
      {error.requestId !== undefined && (
        <p className="mt-1 text-xs text-muted">
          Request id <span className="font-mono">{error.requestId}</span>
        </p>
      )}
    </div>
  );
}

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, 'Something went wrong. Try again.');
}

export function SignInPage() {
  const navigate = useNavigate();
  const returnPath = useReturnPath();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const emailError = EMAIL.test(email.trim()) ? undefined : 'Enter your email address.';
  const passwordError = password === '' ? 'Enter your password.' : undefined;

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setTouched(true);
    if (emailError !== undefined || passwordError !== undefined) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await session.signIn(email.trim(), password);
      await navigate(returnPath, { replace: true });
    } catch (failure) {
      setError(asApiError(failure));
      setPending(false);
    }
  };

  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          New here?{' '}
          <Link
            to={`/sign-up?from=${encodeURIComponent(returnPath)}`}
            className="text-accent hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          error={touched ? emailError : undefined}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          error={touched ? passwordError : undefined}
        />
        <FormError error={error} />
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}

export function SignUpPage() {
  const navigate = useNavigate();
  const returnPath = useReturnPath();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const errors = {
    email: EMAIL.test(email.trim()) ? undefined : 'Enter a valid email address.',
    username: USERNAME.test(username)
      ? undefined
      : 'Use 3 to 24 lowercase letters, digits or underscores.',
    password:
      password.length < PASSWORD_MIN || password.length > PASSWORD_MAX
        ? `Use ${String(PASSWORD_MIN)} to ${String(PASSWORD_MAX)} characters.`
        : undefined,
  };
  // The API's own messages for a field, when it rejected the form.
  const serverError = (field: string) =>
    error?.fieldErrors.find((fieldError) => fieldError.field === field)?.message;

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setTouched(true);
    if (Object.values(errors).some((message) => message !== undefined)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await session.signUp(email.trim(), username, password);
      await navigate(returnPath, { replace: true });
    } catch (failure) {
      setError(asApiError(failure));
      setPending(false);
    }
  };

  return (
    <AuthCard
      title="Create an account"
      footer={
        <>
          Already have one?{' '}
          <Link
            to={`/sign-in?from=${encodeURIComponent(returnPath)}`}
            className="text-accent hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          error={touched ? (errors.email ?? serverError('email')) : undefined}
        />
        <TextField
          label="Username"
          autoComplete="username"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
          hint="Shown on your reviews and profile."
          error={touched ? (errors.username ?? serverError('username')) : undefined}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          hint={`${String(PASSWORD_MIN)} to ${String(PASSWORD_MAX)} characters.`}
          error={touched ? (errors.password ?? serverError('password')) : undefined}
        />
        <FormError error={error} />
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
