import { Link, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';

function Home() {
  return (
    <main className="shell">
      <p className="eyebrow">Bora Jogar</p>
      <h1>Beach volleyball, easier to organize.</h1>
      <p className="lead">Find compatible players, coordinate schedules, and get on court.</p>
      <div className="actions">
        <Link className="button" to="/login">
          Get started
        </Link>
        <Link className="text-link" to="/games">
          Explore games
        </Link>
      </div>
      <section className="card" aria-labelledby="foundation-title">
        <h2 id="foundation-title">Project foundation ready</h2>
        <p>
          React, strict TypeScript, routing, server-state management, testing, and responsive
          PWA-ready layout are configured.
        </p>
      </section>
    </main>
  );
}

function Login() {
  const [searchParams] = useSearchParams();
  const invitation = searchParams.get('invite');
  const error = searchParams.get('error');
  const googleURL = new URL('/api/v1/auth/google', window.location.origin);
  if (invitation) googleURL.searchParams.set('invitation', invitation);
  return (
    <main className="shell">
      <Link className="text-link" to="/">
        ← Home
      </Link>
      <p className="eyebrow">Private beta</p>
      <h1>Sign in to play.</h1>
      <p className="lead">Bora Jogar is invite-only while we build the first local community.</p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <a className="button" href={googleURL.toString()}>
        Continue with Google
      </a>
      {invitation ? (
        <p className="hint">Invitation code ready.</p>
      ) : (
        <p className="hint">Open an invitation link to create an account.</p>
      )}
    </main>
  );
}

function Invite() {
  const { code } = useParams();
  return <Navigate replace to={`/login?invite=${encodeURIComponent(code ?? '')}`} />;
}

function Placeholder({ title }: { title: string }) {
  return (
    <main className="shell">
      <Link className="text-link" to="/">
        ← Home
      </Link>
      <h1>{title}</h1>
      <p className="lead">This feature arrives in a later milestone.</p>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/invite/:code" element={<Invite />} />
      <Route path="/games" element={<Placeholder title="Games" />} />
      <Route path="*" element={<Placeholder title="Page not found" />} />
    </Routes>
  );
}
