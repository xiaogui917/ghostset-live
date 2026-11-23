import type { ReactNode } from "react";
import type { ShowAccount } from "../lib/client";
import { enumKey } from "../lib/format";
import { Badge, Button, Panel } from "./UI";
import type { IconName } from "./UI";

interface FlowPanelProps {
  show: ShowAccount | null;
  busy: boolean;
  onInitialize: () => void;
  onJoinAll: () => void;
  onDelegate: () => void;
  onRequestVrf: () => void;
  onOpenRound: () => void;
  onCommitAll: () => void;
  onRevealAll: () => void;
  onCloseRound: () => void;
  onFinalize: () => void;
  onAbort: () => void;
}

function Step({ number, title, detail, done, children }: { number: number; title: string; detail: string; done: boolean; children: ReactNode }) {
  return (
    <div className="relative flex gap-3 pb-5 last:pb-0">
      <div className="relative flex flex-col items-center"><div className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[9px] ${done ? "border-acid/40 bg-acid/10 text-acid" : "border-line bg-panel text-slate-500"}`}>{done ? "✓" : String(number).padStart(2, "0")}</div><div className="absolute top-6 h-full w-px bg-line/80 last:hidden" /></div>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className={`text-xs font-semibold ${done ? "text-slate-300" : "text-slate-400"}`}>{title}</div><div className="mt-1 text-[10px] leading-4 text-slate-600">{detail}</div></div>{children}</div></div>
    </div>
  );
}

export function FlowPanel({ show, busy, onInitialize, onJoinAll, onDelegate, onRequestVrf, onOpenRound, onCommitAll, onRevealAll, onCloseRound, onFinalize, onAbort }: FlowPanelProps) {
  const state = show ? enumKey(show.state) : "missing";
  const phase = show ? enumKey(show.roundPhase) : "idle";
  const vrf = show ? enumKey(show.vrfStatus) : "idle";
  const joined = show?.seats.filter((seat) => seat.joined).length ?? 0;
  const committed = show?.pledges.filter((pledge) => pledge.committed).length ?? 0;
  const revealed = show?.pledges.filter((pledge) => pledge.committed && pledge.revealed).length ?? 0;
  const canOpen = Boolean(show && (state === "vrfReady" || state === "running") && vrf === "ready" && !show.roundOpen && show.closedRounds < show.totalRounds);
  const canFinalize = Boolean(show && !show.finalizeScheduled && !show.roundOpen && (show.cancelled || show.closedRounds === show.totalRounds) && ["delegated", "vrfReady", "running"].includes(state));
  const action = (label: string, onClick: () => void, enabled: boolean, icon: IconName = "play", primary = false) => <Button variant={primary ? "primary" : "secondary"} icon={icon} busy={busy} disabled={busy || !enabled} onClick={onClick} className="shrink-0">{label}</Button>;

  return (
    <Panel title="Performance run" eyebrow="11 user instructions · fixed routing" action={<Badge tone="live"><span className="h-1 w-1 animate-pulseSoft rounded-full bg-mint" />Ready</Badge>}>
      <div className="p-5">
        <Step number={1} title="Initialize" detail="Create Show + Vault on Solana L1" done={Boolean(show)}>{action("Initialize", onInitialize, !show, "plus", true)}</Step>
        <Step number={2} title="Fill the room" detail={`${joined}/4 seats joined · 0.5 SOL default each`} done={joined === 4}>{action("Join all", onJoinAll, Boolean(show && joined < 4 && ["uninitialized", "funded"].includes(state)), "users")}</Step>
        <Step number={3} title="Delegate to ER" detail="Only the Show account leaves L1" done={["delegated", "vrfReady", "running", "finalizing", "onL1", "closed"].includes(state)}>{action("Delegate", onDelegate, state === "funded" && joined === 4, "bolt", true)}</Step>
        <Step number={4} title="Request randomness" detail="One scoped VRF request seeds every round" done={vrf === "requested" || vrf === "ready"}>{action(vrf === "requested" ? "Waiting" : "Request VRF", onRequestVrf, state === "delegated" && vrf === "idle", "radio")}</Step>
        <Step number={5} title="Open round" detail={show && show.closedRounds > 0 && !show.roundOpen ? `Next: round ${show.closedRounds + 1}/${show.totalRounds}` : "Derive round seed on the ephemeral layer"} done={Boolean(show?.roundOpen)}>{action(show && show.closedRounds > 0 ? "Open next" : "Open round", onOpenRound, canOpen, "play", true)}</Step>
        <Step number={6} title="Commit pledges" detail={`${committed}/4 sealed · full cap escrowed per seat`} done={Boolean(show?.roundOpen && committed === 4)}>{action("Commit all", onCommitAll, Boolean(show?.roundOpen && phase === "commit" && committed < 4), "lock")}</Step>
        <Step number={7} title="Reveal pledges" detail={`${revealed}/4 public · auto-waits for the reveal window`} done={Boolean(show?.roundOpen && committed === 4 && revealed === 4)}>{action("Reveal all", onRevealAll, Boolean(show?.roundOpen && committed > 0 && revealed < committed && ["commit", "reveal"].includes(phase)), "unlock")}</Step>
        <Step number={8} title="Close + score" detail="Auto-waits past the reveal deadline" done={Boolean(show && !show.roundOpen && phase === "closed" && show.closedRounds > 0)}>{action("Close round", onCloseRound, Boolean(show?.roundOpen), "check", true)}</Step>
        <Step number={9} title="Commit + undelegate" detail="Finalize on ER, then wait for L1 settlement" done={Boolean(show?.finalizeScheduled)}>{action("Finalize", onFinalize, canFinalize, "download", true)}</Step>
        {show && ["delegated", "vrfReady", "running"].includes(state) && !show.cancelled ? <div className="mt-2 border-t border-line/70 pt-4"><Button variant="danger" icon="close" busy={busy} disabled={busy} onClick={onAbort} className="w-full">Abort show on ER</Button></div> : null}
      </div>
    </Panel>
  );
}
