import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * The app's crash net (Loo 2026-07-26).
 *
 * WHY THIS EXISTS: there was no error boundary anywhere in apps/web, so a
 * single render error unmounted the whole tree and left a BLANK WHITE PAGE with
 * no message, no URL change and no way back. That is exactly what Loo hit after
 * a rental signup: the agreement had been created correctly in the database and
 * the screen showed nothing at all, so the only readable signal was "it broke"
 * — indistinguishable from "it did nothing".
 *
 * A blank page is the worst possible failure for a non-technical operator at a
 * store counter: it destroys the one thing they need, which is knowing whether
 * the customer's order went through. This boundary makes the answer visible.
 *
 * Two levels are mounted (see main.tsx / App.tsx):
 *   - ROOT: catches anything the route boundary missed, so the page is never
 *     blank under any circumstance.
 *   - ROUTE: wraps the routed area, so one broken page keeps the shell alive
 *     and "Try again" can re-mount just that page.
 */

interface Props {
  children: ReactNode;
  /** Shown above the message — which part of the app failed. */
  area?: string;
  /** Root-level boundaries offer a full reload; route-level offer a retry. */
  variant?: "root" | "route";
}

interface State {
  error: Error | null;
  /** Bumping this re-mounts the subtree, so "Try again" is a real retry. */
  attempt: number;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry sink yet — the console is what a developer has when Loo
    // sends a screenshot. Keep BOTH the error and the component stack: the
    // stack is the only thing that names the failing component in a minified
    // production bundle.
    console.error("[carres] render crash", this.props.area ?? "app", error, info.componentStack);
  }

  private reset = () => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  render() {
    const { error } = this.state;
    if (!error) {
      // `key` on the subtree is what makes the retry genuine — without it React
      // reuses the same instances and the crash repeats immediately.
      return <div key={this.state.attempt} className="contents">{this.props.children}</div>;
    }

    const isRoot = this.props.variant === "root";

    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background p-6"
        data-testid="error-boundary"
        role="alert"
      >
        <div className="max-w-md w-full rounded-md border border-border bg-card p-6 text-center">
          <div className="text-label uppercase tracking-[0.12em] text-muted-foreground">
            {this.props.area ?? "Carres Portal"}
          </div>
          <h1 className="text-title font-semibold text-foreground mt-1.5">
            This page hit a problem
          </h1>
          <p className="text-body text-muted-foreground mt-2 leading-relaxed">
            Nothing you just did was lost — anything already saved is safe. Try again, and if
            it keeps happening, send this screen to the team.
          </p>

          <div className="flex items-center justify-center gap-2 mt-5">
            <button
              type="button"
              onClick={this.reset}
              className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-meta font-semibold"
              data-testid="error-boundary-retry"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              className="px-3 py-2 rounded-md border border-border text-meta font-semibold"
              data-testid="error-boundary-home"
            >
              Back to start
            </button>
            {isRoot && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3 py-2 rounded-md border border-border text-meta font-semibold"
              >
                Reload
              </button>
            )}
          </div>

          {/* The message is the one thing that makes a screenshot actionable.
              Collapsed so the screen stays calm for the operator, but present. */}
          <details className="mt-5 text-left">
            <summary className="text-label text-muted-foreground cursor-pointer">
              Technical detail
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/40 p-2 text-label whitespace-pre-wrap break-words text-muted-foreground">
              {error.message || String(error)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
