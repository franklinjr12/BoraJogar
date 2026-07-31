import { Link, Route, Routes } from 'react-router-dom';

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
      <Route path="/login" element={<Placeholder title="Sign in" />} />
      <Route path="/games" element={<Placeholder title="Games" />} />
      <Route path="*" element={<Placeholder title="Page not found" />} />
    </Routes>
  );
}
