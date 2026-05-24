import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

type ProposalStatus = "pending" | "approved" | "rejected";

type RawNote = {
  id: string;
  title: string | null;
  domain: string | null;
  bodyMarkdown: string;
  createdAt: string;
};

type ProposalItem = {
  id: string;
  actionType: string;
  targetType: string | null;
  payload: Record<string, unknown>;
  rationale: string | null;
  status: ProposalStatus;
};

type Proposal = {
  id: string;
  rawNoteId: string | null;
  detectedDomain: string | null;
  detectedKnowledgeType: string | null;
  impactLevel: number;
  confidence: string;
  status: ProposalStatus;
  rationale: string | null;
  items: ProposalItem[];
  createdAt: string;
};

type CompiledNote = {
  id: string;
  domain: string;
  noteType: string;
  title: string;
  bodyMarkdown: string;
  updatedAt: string;
};

type Mistake = {
  id: string;
  domain: string;
  category: string | null;
  title: string;
  description: string;
  evidenceCount: number;
};

type ReviewTask = {
  id: string;
  domain: string;
  title: string;
  description: string;
  status: string;
};

type ReadinessItem = {
  id: string;
  domain: string;
  area: string;
  status: string;
  rationale: string | null;
};

type WorkspaceData = {
  rawNotes: RawNote[];
  proposals: Proposal[];
  compiledNotes: CompiledNote[];
  mistakes: Mistake[];
  reviewTasks: ReviewTask[];
  readinessItems: ReadinessItem[];
};

const emptyWorkspaceData: WorkspaceData = {
  rawNotes: [],
  proposals: [],
  compiledNotes: [],
  mistakes: [],
  reviewTasks: [],
  readinessItems: [],
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function loadWorkspaceData(): Promise<WorkspaceData> {
  const [rawNotes, proposals, compiledNotes, mistakes, reviewTasks, readinessItems] =
    await Promise.all([
      requestJson<{ rawNotes: RawNote[] }>("/raw-notes"),
      requestJson<{ proposals: Proposal[] }>("/update-proposals"),
      requestJson<{ compiledNotes: CompiledNote[] }>("/compiled-notes"),
      requestJson<{ mistakes: Mistake[] }>("/mistakes"),
      requestJson<{ reviewTasks: ReviewTask[] }>("/review-tasks"),
      requestJson<{ readinessItems: ReadinessItem[] }>("/readiness-map"),
    ]);

  return {
    rawNotes: rawNotes.rawNotes,
    proposals: proposals.proposals,
    compiledNotes: compiledNotes.compiledNotes,
    mistakes: mistakes.mistakes,
    reviewTasks: reviewTasks.reviewTasks,
    readinessItems: readinessItems.readinessItems,
  };
}

function payloadLabel(payload: Record<string, unknown>) {
  for (const key of ["title", "area", "status", "domain", "noteType"]) {
    const value = payload[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }

  return "Update";
}

function App() {
  const [title, setTitle] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData>(emptyWorkspaceData);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProposal = useMemo(() => {
    return (
      workspaceData.proposals.find((proposal) => proposal.id === selectedProposalId) ??
      workspaceData.proposals.find((proposal) => proposal.status === "pending") ??
      workspaceData.proposals[0] ??
      null
    );
  }, [selectedProposalId, workspaceData.proposals]);

  async function refresh() {
    setIsLoading(true);
    try {
      setWorkspaceData(await loadWorkspaceData());
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load workspace");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submitRawNote(event: React.FormEvent) {
    event.preventDefault();
    if (!bodyMarkdown.trim()) {
      setError("Write a practice note first.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await requestJson<{ proposal: Proposal | null }>("/raw-notes", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || null,
          bodyMarkdown,
        }),
      });
      setTitle("");
      setBodyMarkdown("");
      setSelectedProposalId(result.proposal?.id ?? null);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save note");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function decideProposal(proposalId: string, decision: "approve" | "reject") {
    await requestJson(`/update-proposals/${proposalId}/${decision}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await refresh();
  }

  async function completeTask(taskId: string) {
    await requestJson(`/review-tasks/${taskId}/complete`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await refresh();
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="masthead">
          <div>
            <p className="eyebrow">Interview Knowledge Compiler</p>
            <h1>Coding practice, compiled into reviewable knowledge.</h1>
          </div>
          <a className="status-pill" href={`${apiBaseUrl}/health`}>
            API health
          </a>
        </header>

        {error ? <div className="alert">{error}</div> : null}

        <section className="grid two-column">
          <form className="panel note-panel" onSubmit={submitRawNote}>
            <div className="panel-header">
              <div>
                <h2>Raw coding note</h2>
                <p>Write the messy reflection. The compiler will draft structured updates.</p>
              </div>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Compiling..." : "Compile note"}
              </button>
            </div>
            <input
              aria-label="Raw note title"
              placeholder="Optional title, e.g. 1334. Find the City..."
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <textarea
              aria-label="Raw practice note"
              value={bodyMarkdown}
              onChange={(event) => setBodyMarkdown(event.target.value)}
              placeholder="Example: 1334. Find the City With the Smallest Number of Neighbors. I missed that this was all-pairs shortest path and should use Floyd-Warshall..."
            />
          </form>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Update proposal</h2>
                <p>Approve only the changes you want in compiled knowledge.</p>
              </div>
              <button type="button" onClick={refresh} disabled={isLoading}>
                Refresh
              </button>
            </div>
            {selectedProposal ? (
              <div className="proposal">
                <div className="proposal-meta">
                  <span>{selectedProposal.detectedDomain}</span>
                  <span>{selectedProposal.detectedKnowledgeType}</span>
                  <span>Impact {selectedProposal.impactLevel}</span>
                  <span>{selectedProposal.confidence}</span>
                  <strong>{selectedProposal.status}</strong>
                </div>
                <p>{selectedProposal.rationale}</p>
                <div className="proposal-items">
                  {selectedProposal.items.map((item) => (
                    <article className="proposal-item" key={item.id}>
                      <div>
                        <strong>{item.actionType.replaceAll("_", " ")}</strong>
                        <p>{payloadLabel(item.payload)}</p>
                      </div>
                      <span>{item.status}</span>
                    </article>
                  ))}
                </div>
                <div className="actions">
                  <button
                    type="button"
                    onClick={() => void decideProposal(selectedProposal.id, "approve")}
                    disabled={selectedProposal.status !== "pending"}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void decideProposal(selectedProposal.id, "reject")}
                    disabled={selectedProposal.status !== "pending"}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : (
              <p className="empty-state">No proposals yet.</p>
            )}
          </section>
        </section>

        <section className="grid dashboard-grid">
          <section className="panel">
            <h2>Readiness map</h2>
            <div className="list">
              {workspaceData.readinessItems.map((item) => (
                <article className="list-item" key={item.id}>
                  <div>
                    <strong>{item.area}</strong>
                    <p>{item.rationale}</p>
                  </div>
                  <span>{item.status}</span>
                </article>
              ))}
              {!workspaceData.readinessItems.length ? <p className="empty-state">No readiness evidence yet.</p> : null}
            </div>
          </section>

          <section className="panel">
            <h2>Review tasks</h2>
            <div className="list">
              {workspaceData.reviewTasks.map((task) => (
                <article className="list-item" key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <p>{task.description}</p>
                  </div>
                  <button
                    type="button"
                    disabled={task.status === "completed"}
                    onClick={() => void completeTask(task.id)}
                  >
                    {task.status === "completed" ? "Done" : "Complete"}
                  </button>
                </article>
              ))}
              {!workspaceData.reviewTasks.length ? <p className="empty-state">No review tasks yet.</p> : null}
            </div>
          </section>

          <section className="panel">
            <h2>Mistakes</h2>
            <div className="list">
              {workspaceData.mistakes.map((mistake) => (
                <article className="list-item" key={mistake.id}>
                  <div>
                    <strong>{mistake.title}</strong>
                    <p>{mistake.description}</p>
                  </div>
                  <span>{mistake.evidenceCount}x</span>
                </article>
              ))}
              {!workspaceData.mistakes.length ? <p className="empty-state">No mistakes approved yet.</p> : null}
            </div>
          </section>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Compiled coding knowledge</h2>
              <p>Approved notes stay bounded and evidence-backed.</p>
            </div>
          </div>
          <div className="compiled-grid">
            {workspaceData.compiledNotes.map((note) => (
              <article className="compiled-note" key={note.id}>
                <span>{note.noteType}</span>
                <h3>{note.title}</h3>
                <pre>{note.bodyMarkdown}</pre>
              </article>
            ))}
            {!workspaceData.compiledNotes.length ? <p className="empty-state">No compiled notes approved yet.</p> : null}
          </div>
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
