import type { CaptureEngine, CaptureView } from "@/capture/engine";

export type CaptureCompanion = {
  close: () => void;
  show: (view: CaptureView) => void;
};

export function floorLine(view: CaptureView): string {
  if (view.phase === "ended") return "Task finished";
  if (view.phase !== "capturing") return "Ready to watch";
  if (view.voice !== "on") return "Watching without voice";
  if (view.muted) return "Muted";
  if (view.floor.state === "open") {
    return view.agentSpeaking ? "Tiro is speaking" : "Tiro is listening";
  }
  return "Tiro is watching quietly";
}

/** Opens the small always-on-top control window before Chrome moves to the shared tab. */
export async function openCaptureCompanion(
  engine: CaptureEngine,
  onClosed: () => void,
): Promise<CaptureCompanion> {
  const api = window.documentPictureInPicture;
  if (!api) {
    throw new Error("The companion window needs Chrome or Edge.");
  }

  const pip = await api.requestWindow({ height: 224, width: 360 });
  const doc = pip.document;
  doc.title = "Tiro companion";
  doc.head.innerHTML = `
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #0f2f2d; color: #fff; font: 14px system-ui, sans-serif; }
      main { min-height: 100vh; padding: 16px; display: flex; flex-direction: column; }
      .eyebrow { color: #99f6e4; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      .state { margin: 7px 0 0; font-size: 20px; font-weight: 700; letter-spacing: -.02em; }
      .detail { min-height: 18px; margin-top: 5px; color: #ccfbf1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .controls { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 7px; margin-top: auto; padding-top: 14px; }
      button { min-height: 38px; border: 1px solid #5eead4; border-radius: 9px; background: #134e4a; color: #fff; font: 600 12px system-ui, sans-serif; cursor: pointer; }
      button:hover:not(:disabled) { background: #115e59; }
      button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
      button:disabled { cursor: not-allowed; border-color: #496563; color: #86a6a3; opacity: .75; }
      .off-record { grid-column: 1 / -1; min-height: 30px; border-style: dashed; background: transparent; }
    </style>`;

  const main = doc.createElement("main");
  const eyebrow = doc.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Tiro companion";
  const state = doc.createElement("div");
  state.className = "state";
  const detail = doc.createElement("div");
  detail.className = "detail";
  const controls = doc.createElement("div");
  controls.className = "controls";
  main.append(eyebrow, state, detail, controls);
  doc.body.append(main);

  const button = (label: string, action: () => void) => {
    const element = doc.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.addEventListener("click", action);
    controls.append(element);
    return element;
  };

  const call = button("Call Tiro", () => engine.callTiro());
  const mute = button("Mute", () => engine.setMuted(!engine.view().muted));
  const end = button("End task", () => void engine.endTask());
  const offRecord = button("Off the record · Not available yet", () => {});
  offRecord.className = "off-record";
  offRecord.disabled = true;

  pip.addEventListener("pagehide", onClosed);

  return {
    show(view) {
      const active = view.phase === "capturing";
      state.textContent = floorLine(view);
      detail.textContent = `${clock(view.elapsedMs)} · ${view.screen?.item ?? view.screen?.name ?? "Waiting for the first screen"}`;
      call.disabled = !active || view.voice !== "on" || view.muted;
      mute.disabled = !active;
      mute.textContent = view.muted ? "Unmute" : "Mute";
      end.disabled = !active;
    },
    close: () => pip.close(),
  };
}

export function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
