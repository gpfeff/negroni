import {
  type CSSProperties,
  type FormEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

type PhaseId = "research" | "creative" | "launch" | "iteration" | "loop";

type Phase = {
  id: PhaseId;
  number: string;
  name: string;
  verb: string;
  summary: string;
  produces: string;
  includes: string[];
  color: string;
  state: "ready" | "planned";
};

const PHASES: Phase[] = [
  {
    id: "research",
    number: "01",
    name: "Research",
    verb: "Find the signal",
    summary:
      "Build the evidence base across the client, the customer, and the competitors before an ad is made.",
    produces: "research-brief.md",
    includes: ["Client economics", "Customer language", "Competitor patterns"],
    color: "#5d3045",
    state: "ready",
  },
  {
    id: "creative",
    number: "02",
    name: "Creative",
    verb: "Make the argument",
    summary:
      "Turn an approved brief into original image and video concepts, variants, copy, and traceable production assets.",
    produces: "creative-manifest.json",
    includes: ["Angles + hooks", "Image systems", "Video scripts"],
    color: "#dd572f",
    state: "planned",
  },
  {
    id: "launch",
    number: "03",
    name: "Launch",
    verb: "Prepare the delivery",
    summary:
      "Translate approved creative into audiences, placements, budgets, rules, tracking, and a reviewable account diff.",
    produces: "launch-diff.md",
    includes: ["Budget rules", "Account structure", "Preflight QA"],
    color: "#315e87",
    state: "planned",
  },
  {
    id: "iteration",
    number: "04",
    name: "Iteration",
    verb: "Isolate the lesson",
    summary:
      "Choose the highest-value uncertainty, register a fair A/B test, and keep weak evidence from becoming a false win.",
    produces: "experiment-result.json",
    includes: ["Test priority", "Decision rules", "Lead quality"],
    color: "#74866b",
    state: "planned",
  },
  {
    id: "loop",
    number: "05",
    name: "Loop",
    verb: "Compound the learning",
    summary:
      "Observe results, diagnose the next constraint, refresh research, and propose the next bounded experiment.",
    produces: "learning-ledger.jsonl",
    includes: ["Autoresearch", "Approval policy", "Keep or discard"],
    color: "#6d6c70",
    state: "planned",
  },
];

const HANDOFFS = [
  "Research brief",
  "Creative batch",
  "Launch diff",
  "Experiment result",
  "Learning ledger",
];

function LoopMark() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <path d="M22 5.5a16.5 16.5 0 1 1-14.7 9" />
      <path d="m5.7 9 .7 7.1 6.8-2.2" />
      <circle cx="22" cy="22" r="4.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function ProjectDialog({
  open,
  onClose,
  onCreate,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, goal: string) => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const nameId = useId();
  const goalId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus();
    };
  }, [open, onClose, returnFocus]);

  if (!open) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    onCreate(cleanName, goal.trim());
    setName("");
    setGoal("");
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <p className="utility-label">Local project draft</p>
            <h2 id="dialog-title">Name the campaign.</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <label htmlFor={nameId}>Project name</label>
          <input
            id={nameId}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Example: Regional home services"
          />
          <label htmlFor={goalId}>What must this campaign accomplish?</label>
          <textarea
            id={goalId}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Describe the offer, lead goal, market, and constraints you already know."
            rows={5}
          />
          <p className="dialog-note">
            This creates a local draft only. It does not open an ad account, publish creative, or spend money.
          </p>
          <div className="dialog-actions">
            <button className="text-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={!name.trim()}>
              Create research draft
              <ArrowIcon />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function App() {
  const [activeId, setActiveId] = useState<PhaseId>("research");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState("Untitled campaign");
  const [notice, setNotice] = useState<string | null>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const activePhase = PHASES.find((phase) => phase.id === activeId) ?? PHASES[0];

  function openDialog() {
    dialogTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setDialogOpen(true);
  }

  function createProject(name: string, goal: string) {
    setProjectName(name);
    setDialogOpen(false);
    setActiveId("research");
    setNotice(
      goal
        ? `Research draft created for ${name}. The campaign goal is held in this open page only.`
        : `Research draft created for ${name}. Add the campaign goal during Research intake.`,
    );
  }

  function selectPhase(phase: Phase) {
    setActiveId(phase.id);
    setNotice(null);
    document.getElementById("phase-contract")?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  return (
    <>
      <div className="site-shell">
        <header className="masthead">
          <a className="wordmark" href="#top" aria-label="Negroni home">
            <span className="mark"><LoopMark /></span>
            <span>Negroni</span>
          </a>
          <div className="header-actions">
            <span className="local-state"><i /> Local draft</span>
            <a href="#workspace">Explore the system</a>
            <button className="header-button" type="button" onClick={openDialog}>
              New project
              <span aria-hidden="true">＋</span>
            </button>
          </div>
        </header>

        <main id="top">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <p className="utility-label">Open-source advertising system</p>
              <h1 id="hero-title">
                Advertising,
                <span>in one learning loop.</span>
              </h1>
              <p className="hero-intro">
                Research the market. Make the ads. Launch with control. Test what matters.
                Feed every result back into the next creative.
              </p>
              <div className="hero-actions">
                <button className="primary-button" type="button" onClick={openDialog}>
                  Start with Research
                  <ArrowIcon />
                </button>
                <a className="text-link" href="#workspace">
                  See all five phases
                </a>
              </div>
              <p className="safety-line">
                <span aria-hidden="true">◎</span>
                Plans autonomously. Acts only with approval.
              </p>
            </div>

            <div className="hero-art" aria-label="Five glass segments form the Negroni campaign loop">
              <img src="/negroni-five-phase-loop.png" alt="" />
              <div className="art-readout">
                <span>System state</span>
                <strong>Foundation build</strong>
              </div>
              <span className="art-caption">Five phases / one evidence trail</span>
            </div>
          </section>

          <section className="workspace" id="workspace" aria-labelledby="workspace-title">
            <div className="workspace-heading">
              <div>
                <p className="utility-label">Campaign workspace</p>
                <h2 id="workspace-title">{projectName}</h2>
              </div>
              <p>
                Select a phase to inspect its responsibility, handoff artifact, and current
                implementation state.
              </p>
            </div>

            {notice ? (
              <div className="notice" role="status">
                <span>Draft ready</span>
                <p>{notice}</p>
                <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">
                  ×
                </button>
              </div>
            ) : null}

            <div className="phase-layout">
              <nav className="phase-list" aria-label="Negroni phases">
                {PHASES.map((phase) => (
                  <button
                    key={phase.id}
                    className={phase.id === activeId ? "phase-button active" : "phase-button"}
                    type="button"
                    aria-pressed={phase.id === activeId}
                    onClick={() => selectPhase(phase)}
                    style={{ "--phase-color": phase.color } as CSSProperties}
                  >
                    <span className="phase-number">{phase.number}</span>
                    <span className="phase-label">
                      <strong>{phase.name}</strong>
                      <small>{phase.verb}</small>
                    </span>
                    <span className={`phase-state ${phase.state}`}>
                      {phase.state === "ready" ? "In progress" : "Planned"}
                    </span>
                  </button>
                ))}
              </nav>

              <article
                className="phase-contract"
                id="phase-contract"
                style={{ "--phase-color": activePhase.color } as CSSProperties}
              >
                <div className="contract-topline">
                  <span>Phase {activePhase.number}</span>
                  <span>{activePhase.state === "ready" ? "Implementation in progress" : "Contract defined"}</span>
                </div>
                <h3>{activePhase.verb}.</h3>
                <p className="contract-summary">{activePhase.summary}</p>

                <div className="contract-grid">
                  <div>
                    <span className="contract-label">Produces</span>
                    <code>{activePhase.produces}</code>
                  </div>
                  <div>
                    <span className="contract-label">Owns</span>
                    <ul>
                      {activePhase.includes.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                </div>

                <div className="contract-action">
                  <div>
                    <span className="contract-label">Next honest action</span>
                    <p>
                      {activePhase.id === "research"
                        ? "Create the three-C brief before generating creative."
                        : `Complete ${PHASES[PHASES.findIndex((phase) => phase.id === activePhase.id) - 1]?.name ?? "the prior phase"} and pass its artifact forward.`}
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      if (activePhase.id === "research") {
                        openDialog();
                      } else {
                        setNotice(`${activePhase.name} is defined but not executable yet. No live action was taken.`);
                      }
                    }}
                  >
                    {activePhase.id === "research" ? "Create Research draft" : `Review ${activePhase.name}`}
                    <ArrowIcon />
                  </button>
                </div>
              </article>
            </div>
          </section>

          <section className="handoff" aria-labelledby="handoff-title">
            <div className="handoff-intro">
              <p className="utility-label">The durable handoff</p>
              <h2 id="handoff-title">Every phase leaves evidence.</h2>
              <p>
                Negroni moves files and receipts between agents—not hidden context and hopeful
                claims.
              </p>
            </div>
            <ol className="handoff-list">
              {HANDOFFS.map((handoff, index) => (
                <li key={handoff}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{handoff}</strong>
                  {index < HANDOFFS.length - 1 ? <ArrowIcon /> : <LoopMark />}
                </li>
              ))}
            </ol>
          </section>

          <section className="principles" aria-labelledby="principles-title">
            <div className="principles-title">
              <p className="utility-label">Designed for the AI age</p>
              <h2 id="principles-title">Fast enough to learn. Strict enough to trust.</h2>
            </div>
            <div className="principles-grid">
              <article>
                <span>01</span>
                <h3>Harness-agnostic</h3>
                <p>Run the system with Codex, Claude, or another capable agent harness.</p>
              </article>
              <article>
                <span>02</span>
                <h3>Evidence before generation</h3>
                <p>Every asset traces back to research, a hypothesis, or a measured result.</p>
              </article>
              <article>
                <span>03</span>
                <h3>Human-governed spend</h3>
                <p>Draft and validate automatically. Require approval for account changes.</p>
              </article>
            </div>
          </section>
        </main>

        <footer>
          <div className="footer-brand">
            <span className="mark"><LoopMark /></span>
            <div>
              <strong>Negroni</strong>
              <small>Lead generation, end to end.</small>
            </div>
          </div>
          <p>Open-source foundation · No campaign actions enabled</p>
        </footer>
      </div>

      <ProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={createProject}
        returnFocus={dialogTriggerRef}
      />
    </>
  );
}
