// A bare companion window for the session bench: the small always-on-top
// window the expert sees while they are in the tool's tab. The product's own
// companion is a screen of Codex's; this one exists so a session can be run
// before that screen does.
import type { CaptureEngine, CaptureView } from "@/capture/engine";

export type Companion = { show: (view: CaptureView) => void; close: () => void };

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** What Tiro is doing, in a few words. */
export function floorLine(view: CaptureView): string {
  if (view.phase === "ended") return "Finished";
  if (view.phase !== "capturing") return "Not started";
  if (view.voice !== "on") return "Watching (no voice)";
  if (view.muted) return "Muted";
  if (view.floor.state === "open") return view.agentSpeaking ? "Tiro is speaking" : "Tiro is listening";
  return "Tiro is watching quietly";
}

/** Opens the companion. Must be called from a click, before the tab is shared. */
export async function openCompanion(engine: CaptureEngine, onClosed: () => void): Promise<Companion> {
  const api = window.documentPictureInPicture;
  if (!api) throw new Error("This browser has no always-on-top window. Use Chrome or Edge.");
  const pip = await api.requestWindow({ width: 320, height: 170 });
  const doc = pip.document;
  doc.title = "Tiro";
  doc.body.style.cssText = "margin:0;padding:12px;font:14px system-ui,sans-serif;background:#111;color:#eee";

  const line = (style: string) => {
    const element = doc.createElement("div");
    element.style.cssText = style;
    doc.body.append(element);
    return element;
  };
  const state = line("font-weight:600;margin-bottom:4px");
  const detail = line("opacity:.7;font-size:12px;min-height:16px");
  const row = line("display:flex;gap:6px;margin-top:10px");

  const button = (label: string, action: () => void) => {
    const element = doc.createElement("button");
    element.textContent = label;
    element.style.cssText = "flex:1;padding:8px 4px;font:13px system-ui,sans-serif;cursor:pointer";
    element.addEventListener("click", action);
    row.append(element);
    return element;
  };
  button("Call Tiro", () => engine.callTiro());
  const mute = button("Mute", () => engine.setMuted(!engine.view().muted));
  button("End task", () => void engine.endTask());

  pip.addEventListener("pagehide", onClosed);
  return {
    show(view) {
      state.textContent = floorLine(view);
      detail.textContent = `${clock(view.elapsedMs)} · ${view.screen?.item ?? view.screen?.name ?? "no screen read yet"}`;
      mute.textContent = view.muted ? "Unmute" : "Mute";
    },
    close: () => pip.close(),
  };
}
