import type { Keypair } from "@solana/web3.js";
import type { ShowAccount } from "../lib/client";
import { formatSol } from "../lib/format";
import { TRACK_COLORS, TRACK_TITLES } from "../lib/tracks";
import { Badge, Button, Icon, KeyLabel } from "./UI";

interface SeatCardProps {
  index: number;
  keypair: Keypair;
  balance: number;
  seat: ShowAccount["seats"][number] | null;
  pledge: ShowAccount["pledges"][number] | null;
  phase: string;
  showState: string;
  joinAmount: string;
  track: number;
  amount: string;
  locked: boolean;
  busy: boolean;
  onTrack: (track: number) => void;
  onAmount: (amount: string) => void;
  onAirdrop: () => void;
  onJoin: () => void;
  onCommit: () => void;
  onReveal: () => void;
  onWithdraw: () => void;
}

export function SeatCard({ index, keypair, balance, seat, pledge, phase, showState, joinAmount, track, amount, locked, busy, onTrack, onAmount, onAirdrop, onJoin, onCommit, onReveal, onWithdraw }: SeatCardProps) {
  const joined = Boolean(seat?.joined);
  const committed = Boolean(pledge?.committed);
  const revealed = Boolean(pledge?.revealed);
  const canReveal = committed && !revealed && (phase === "commit" || phase === "reveal");
  const canWithdraw = showState === "onL1" && joined && seat?.credit.gtn(0);
  return (
    <article className="rounded-xl border border-line bg-black/20 p-4 transition-colors hover:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-mint/20 bg-mint/[0.07] font-mono text-xs text-mint">S{index + 1}</div>
          <div><div className="text-xs font-semibold text-slate-200">Developer seat {index + 1}</div><KeyLabel value={keypair.publicKey} className="mt-1" /></div>
        </div>
        {revealed ? <Badge tone="acid">Revealed</Badge> : committed ? <Badge tone="live">Committed</Badge> : joined ? <Badge>Joined</Badge> : <Badge>Open</Badge>}
      </div>

      <div className="my-4 grid grid-cols-3 gap-2 rounded-lg border border-line/70 bg-black/20 p-3">
        <div><div className="eyebrow">Wallet</div><div className="mt-1.5 font-mono text-[11px] text-slate-300">{formatSol(balance, 3)} <span className="text-slate-600">SOL</span></div></div>
        <div><div className="eyebrow">Credit</div><div className="mt-1.5 font-mono text-[11px] text-slate-300">{formatSol(seat?.credit ?? 0, 3)} <span className="text-slate-600">SOL</span></div></div>
        <div><div className="eyebrow">Escrow</div><div className="mt-1.5 font-mono text-[11px] text-slate-300">{formatSol(pledge?.escrow ?? 0, 3)} <span className="text-slate-600">SOL</span></div></div>
      </div>

      <div className="grid grid-cols-[1fr_100px] gap-2">
        <label><span className="field-label">Track</span><select className="field" value={track} onChange={(event) => onTrack(Number(event.target.value))} disabled={locked || !joined || committed}>{TRACK_TITLES.map((title, trackIndex) => <option key={title} value={trackIndex} style={{ color: TRACK_COLORS[trackIndex] }}>{title}</option>)}</select></label>
        <label><span className="field-label">Pledge · SOL</span><input className="field" value={amount} onChange={(event) => onAmount(event.target.value)} inputMode="decimal" disabled={locked || !joined || committed} aria-label={`Seat ${index + 1} pledge in SOL`} /></label>
      </div>

      {revealed && pledge ? <div className="mt-3 rounded-lg border border-acid/15 bg-acid/[0.04] px-3 py-2 font-mono text-[10px] text-slate-400">{TRACK_TITLES[pledge.track]} · {formatSol(pledge.amount)} SOL · +{formatSol(seat?.credit ?? 0, 3)} credit</div> : committed ? <div className="mt-3 flex items-center gap-2 rounded-lg border border-mint/10 bg-mint/[0.035] px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-mint/70"><Icon name="lock" size={11} /> Secret held only in this browser</div> : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {!joined ? <Button variant="primary" icon="plus" busy={busy} disabled={locked} onClick={onJoin} className="col-span-2">Join · {joinAmount} SOL</Button> : <>
          <Button icon="lock" busy={busy} disabled={locked || phase !== "commit" || committed} onClick={onCommit}>Commit</Button>
          <Button icon="unlock" busy={busy} disabled={locked || !canReveal} onClick={onReveal}>Reveal</Button>
        </>}
        <Button variant="ghost" icon="coins" busy={busy} disabled={locked} onClick={onAirdrop}>Airdrop 1 SOL</Button>
        <Button variant="ghost" icon="download" busy={busy} disabled={locked || !canWithdraw} onClick={onWithdraw}>Withdraw credit</Button>
      </div>
    </article>
  );
}
