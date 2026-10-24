import { Component } from 'react';

// Catches render crashes anywhere below it so one bad component can never
// blank the whole app again (the 2026-10-24 outage: a missing import in one
// component left users staring at an empty page with no way to recover).
// Must match the autosave key in App.jsx.
const AUTOSAVE_KEY = 'vectorforge-autosave-v1';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the failure visible to developers without leaking it into the UI.
    console.error('VectorForge crashed:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleFreshStart = () => {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      // Private mode or blocked storage: reloading is still the best recovery.
    }
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#1e1e1e] px-6 text-center text-gray-100">
          <h1 className="text-xl font-bold">Something went wrong in VectorForge</h1>
          <p className="max-w-md text-sm text-gray-400">
            The editor hit an unexpected error and could not keep drawing.
            Your work is autosaved in this browser — reloading usually brings it back.
          </p>
          <p className="max-w-md rounded bg-[#2a2a2a] px-3 py-2 text-left font-mono text-xs text-red-300">
            {String(this.state.error.message || this.state.error)}
          </p>
          <div className="flex gap-2">
            <button
              onClick={this.handleReload}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Reload
            </button>
            <button
              onClick={this.handleFreshStart}
              className="rounded-md bg-[#3a3a3a] px-4 py-2 text-sm text-gray-200 hover:bg-[#444]"
            >
              Start fresh (clears autosave)
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
