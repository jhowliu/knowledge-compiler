import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

function App() {
  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="masthead">
          <div>
            <p className="eyebrow">Interview Knowledge Compiler</p>
            <h1>Turn practice notes into durable interview knowledge.</h1>
          </div>
          <a className="status-pill" href={`${apiBaseUrl}/health`}>
            API health
          </a>
        </header>

        <section className="note-panel">
          <div className="panel-header">
            <div>
              <h2>Raw note</h2>
              <p>Capture the messy reflection first. The agent proposal comes after.</p>
            </div>
            <button type="button">Save draft</button>
          </div>
          <textarea
            aria-label="Raw practice note"
            placeholder="Example: 1334. I missed that this was all-pairs shortest path and should use Floyd-Warshall..."
          />
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
