import type { Keypair } from "@solana/web3.js";
import type { ShowAccount } from "../lib/client";
import { formatSol } from "../lib/format";
import { Badge, Button, KeyLabel, Panel } from "./UI";

export interface ShowSetup {
  totalRounds: string;
  pledgeCap: string;
  joinAmount: string;
  commitSlots: string;
  revealSlots: string;
}

export function SetupPanel({ setup, show, house, balance, busy, onChange, onAirdrop }: { setup: ShowSetup; show: ShowAccount | null; house: Keypair; balance: number; busy: boolean; onChange: (key: keyof ShowSetup, value: string) => void; onAirdrop: () => void }) {
  const slotTotal = Number(setup.commitSlots) + Number(setup.revealSlots);
  return (
    <Panel title="Show parameters" eyebrow="Devnet performance #01" action={<Badge tone="warn">Devnet only</Badge>}>
      <div className="p-5">
        <div className="mb-5 rounded-xl border border-line bg-black/20 p-3.5">
          <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-semibold text-slate-200">House authority <Badge tone="acid">DJ · 50%</Badge></div><KeyLabel value={house.publicKey} className="mt-1.5" /></div><div className="text-right"><div className="eyebrow">L1 balance</div><div className="mt-1 font-mono text-xs text-slate-300">{formatSol(balance, 3)} SOL</div></div></div>
          <Button variant="ghost" icon="coins" busy={busy} disabled={busy} onClick={onAirdrop} className="mt-3 w-full">Airdrop 2 SOL · auto retry</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label><span className="field-label">Total rounds</span><input type="number" min="1" max="8" className="field" value={setup.totalRounds} disabled={Boolean(show) || busy} onChange={(event) => onChange("totalRounds", event.target.value)} /></label>
          <label><span className="field-label">Join amount · SOL</span><input className="field" inputMode="decimal" value={setup.joinAmount} disabled={busy || show?.seats.every((seat) => seat.joined)} onChange={(event) => onChange("joinAmount", event.target.value)} /></label>
          <label><span className="field-label">Pledge cap · SOL</span><input className="field" inputMode="decimal" value={setup.pledgeCap} disabled={Boolean(show) || busy} onChange={(event) => onChange("pledgeCap", event.target.value)} /></label>
          <div className="rounded-lg border border-line bg-black/20 px-3 py-2"><div className="field-label mb-1">Royalty split</div><div className="font-mono text-xs text-slate-300">50 / 30 / 20</div></div>
          <label><span className="field-label">Commit slots</span><input type="number" min="1" className="field" value={setup.commitSlots} disabled={Boolean(show) || busy} onChange={(event) => onChange("commitSlots", event.target.value)} /></label>
          <label><span className="field-label">Reveal slots</span><input type="number" min="1" className="field" value={setup.revealSlots} disabled={Boolean(show) || busy} onChange={(event) => onChange("revealSlots", event.target.value)} /></label>
        </div>
        <div className="mt-3 flex justify-between font-mono text-[9px] uppercase tracking-wider text-slate-600"><span>≈ 10 ms per ER slot</span><span className={slotTotal >= 60000 ? "text-red-400" : ""}>{Number.isFinite(slotTotal) ? slotTotal.toLocaleString() : "—"} / &lt;60,000</span></div>
      </div>
    </Panel>
  );
}
