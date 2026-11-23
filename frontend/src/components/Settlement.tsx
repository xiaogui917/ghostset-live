import type { Keypair } from "@solana/web3.js";
import type { ShowAccount, VaultAccount } from "../lib/client";
import { formatSol } from "../lib/format";
import { BENEFICIARY_ROLES } from "../lib/tracks";
import { Badge, Button, KeyLabel, Panel } from "./UI";

export function Settlement({ show, vault, signers, busy, onWithdraw }: { show: ShowAccount | null; vault: VaultAccount | null; signers: (Keypair | null)[]; busy: boolean; onWithdraw: (signer: Keypair, index: number) => void }) {
  return (
    <Panel title="L1 settlement" eyebrow="50 / 30 / 20 royalty split" action={<Badge tone={show?.finalizeScheduled ? "acid" : "neutral"}>{show?.finalizeScheduled ? "Ready" : "Locked"}</Badge>}>
      <div className="p-5">
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-line bg-black/20 p-3"><div className="eyebrow">Liabilities</div><div className="mt-1.5 font-mono text-xs text-slate-300">{formatSol(show?.liabilityTotal ?? 0)} SOL</div></div>
          <div className="rounded-lg border border-line bg-black/20 p-3"><div className="eyebrow">Vault tracked</div><div className="mt-1.5 font-mono text-xs text-slate-300">{formatSol(vault?.totalLiability ?? 0)} SOL</div></div>
        </div>
        <div className="space-y-2">
          {BENEFICIARY_ROLES.map((role, index) => {
            const signer = signers[index];
            const pending = show?.royaltyPending[index];
            const canWithdraw = Boolean(show && enumState(show) === "onL1" && pending?.gtn(0) && signer);
            return <div key={role} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-black/20 p-3"><div className="min-w-0"><div className="flex items-center gap-2 text-xs font-medium text-slate-300">{role}<span className="font-mono text-[9px] text-slate-600">{show?.royaltyBps[index] ? show.royaltyBps[index] / 100 : [50, 30, 20][index]}%</span></div><div className="mt-1">{show?.beneficiaries[index] ? <KeyLabel value={show.beneficiaries[index]} /> : <span className="font-mono text-[10px] text-slate-600">Not initialized</span>}</div></div><div className="text-right"><div className="mb-2 font-mono text-[11px] text-amber">{formatSol(pending ?? 0, 4)} SOL</div><Button icon="download" busy={busy} disabled={busy || !canWithdraw} onClick={() => signer && onWithdraw(signer, index)} className="min-h-7 px-2 py-1 text-[9px]">Withdraw</Button></div></div>;
          })}
        </div>
        <p className="mt-4 text-[10px] leading-4 text-slate-600">Seat credits are withdrawn from each seat card. Every recipient signs locally; no wallet adapter is used.</p>
      </div>
    </Panel>
  );
}

function enumState(show: ShowAccount): string {
  return Object.keys(show.state)[0] ?? "unknown";
}
