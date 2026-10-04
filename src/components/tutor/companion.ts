import type { TutorEngine, TutorView } from "@/capture/tutor";

export type TutorCompanion = {
  close: () => void;
  show: (view: TutorView) => void;
};

export function tutorFloorLine(view: TutorView) {
  if (view.phase === "ended") return "Session finished";
  if (view.phase !== "teaching") return "Ready to learn";
  if (view.muted) return "Muted";
  if (view.checking) return "Checking your answer";
  if (view.floor.state === "open") {
    return view.agentSpeaking ? "Tiro is speaking" : "Tiro is listening";
  }
  return "Tiro is watching quietly";
}

/** Opens the always-on-top tutor controls and expert replay before the shared tab takes focus. */
export async function openTutorCompanion(
  engine: TutorEngine,
  onClosed: () => void,
): Promise<TutorCompanion> {
  const api = window.documentPictureInPicture;
  if (!api) throw new Error("The companion window needs Chrome or Edge.");

  const pip = await api.requestWindow({ height: 520, width: 420 });
  const doc = pip.document;
  doc.title = "Tiro tutor companion";
  doc.head.innerHTML = `
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f5f2eb; color: #18211e; font: 14px system-ui, sans-serif; }
      main { min-height: 100vh; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
      .label { color: #315f73; font-size: 9px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
      .state { margin-top: 5px; font: 600 20px/1.2 Georgia, serif; letter-spacing: -.02em; }
      .detail { margin-top: 5px; color: #59635f; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .replay { display: none; overflow: hidden; border: 1px solid #d8d5cc; border-radius: 8px; background: #fffefa; color: #18211e; box-shadow: 0 14px 32px rgba(24,33,30,.1); }
      .replay.visible { display: block; }
      .replay img { display: none; width: 100%; max-height: 210px; object-fit: cover; object-position: top; background: #ebe9e2; }
      .replay img.visible { display: block; }
      .replay-copy { padding: 12px; }
      .replay-rule { margin: 4px 0 0; font-weight: 700; line-height: 1.4; }
      .replay-quote { margin: 7px 0 0; color: #59635f; font: italic 13px/1.5 Georgia, serif; }
      .controls { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1px; margin-top: auto; border: 1px solid #d8d5cc; background: #d8d5cc; }
      button { min-height: 46px; border: 0; background: #fffefa; color: #123e35; font: 700 11px system-ui, sans-serif; cursor: pointer; }
      button:hover:not(:disabled) { background: #f5f2eb; }
      button:focus-visible { outline: 2px solid #247ca1; outline-offset: -3px; }
      button:disabled { cursor: not-allowed; color: #8b918e; opacity: .75; }
    </style>`;

  const main = doc.createElement("main");
  const status = doc.createElement("section");
  const label = doc.createElement("div");
  label.className = "label";
  label.textContent = "Tiro tutor";
  const state = doc.createElement("div");
  state.className = "state";
  const detail = doc.createElement("div");
  detail.className = "detail";
  status.append(label, state, detail);

  const replay = doc.createElement("section");
  replay.className = "replay";
  const picture = doc.createElement("img");
  picture.alt = "The expert’s screen at this moment";
  const replayCopy = doc.createElement("div");
  replayCopy.className = "replay-copy";
  const replayLabel = doc.createElement("div");
  replayLabel.className = "label";
  replayLabel.style.color = "#a96713";
  replayLabel.textContent = "What the expert did";
  const replayRule = doc.createElement("p");
  replayRule.className = "replay-rule";
  const replayQuote = doc.createElement("p");
  replayQuote.className = "replay-quote";
  replayCopy.append(replayLabel, replayRule, replayQuote);
  replay.append(picture, replayCopy);

  const controls = doc.createElement("div");
  controls.className = "controls";
  main.append(status, replay, controls);
  doc.body.append(main);

  const button = (text: string, action: () => void) => {
    const element = doc.createElement("button");
    element.type = "button";
    element.textContent = text;
    element.addEventListener("click", action);
    controls.append(element);
    return element;
  };

  const call = button("Call Tiro", () => engine.callTiro());
  const mute = button("Mute", () => engine.setMuted(!engine.view().muted));
  const end = button("End session", () => void engine.end());
  pip.addEventListener("pagehide", onClosed);

  return {
    show(view) {
      const active = view.phase === "teaching";
      state.textContent = tutorFloorLine(view);
      detail.textContent = `${clock(view.elapsedMs)} · ${view.screen?.item ?? view.screen?.name ?? "Waiting for the first screen"}`;
      call.disabled = !active || view.voice !== "on" || view.floor.state === "open" || view.muted;
      mute.disabled = !active;
      mute.textContent = view.muted ? "Unmute" : "Mute";
      end.disabled = !active;

      const moment = view.replay;
      replay.classList.toggle("visible", Boolean(moment));
      if (moment) {
        replayRule.textContent = `Rule ${moment.number}: ${moment.statement}`;
        replayQuote.textContent = `“${moment.quote.text}”`;
        if (moment.moment.picture) {
          picture.src = moment.moment.picture;
          picture.classList.add("visible");
        } else {
          picture.removeAttribute("src");
          picture.classList.remove("visible");
        }
      }
    },
    close: () => pip.close(),
  };
}

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
