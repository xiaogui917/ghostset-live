import type { ShowAccount } from "../lib/client";
import { enumKey, formatSol, integerSqrt, stateLabel } from "../lib/format";
import { TRACK_COLORS, TRACK_TITLES } from "../lib/tracks";
import { Badge, EmptyState, Icon } from "./UI";

export function Stage({ show, erSlot }: { show: ShowAccount | null; erSlot: number | null }) {
  if (!show) {
    return (
      <section className="panel stage-grid min-h-[430px]">
        <div className="relative z-10 flex items-center justify-between border-b border-line/80 px-5 py-4">
          <div><div className="eyebrow mb-1">Live stage</div><h2 className="text-sm font-semibold">Awaiting a show</h2></div>
          <Badge>Offline</Badge>
        </div>
        <div className="relative z-10"><EmptyState title="The room is dark" detail="Initialize a show, fill four developer seats, and delegate the Show account to begin the performance." /></div>
      </section>
    );
  }

  const phase = enumKey(show.roundPhase);
  const closed = phase === "closed" && show.closedRounds > show.currentRound;
  const result = closed ? show.winners[show.currentRound] : null;
  const scores: bigint[] = result
    ? result.scores.map((score: NonNullable<typeof result>["scores"][number]) => BigInt(score.toString()))
    : [0n, 0n, 0n];
  if (!result) {
    for (const pledge of show.pledges) {
      if (pledge.committed && pledge.revealed && pledge.track < 3) scores[pledge.track] += integerSqrt(pledge.amount);
    }
  }
  const maxScore = scores.reduce((max: bigint, score: bigint) => score > max ? score : max, 0n);
  const nowSlot = erSlot ?? 0;
  const commitDeadline = Number(show.commitDeadlineSlot.toString());
  const revealDeadline = Number(show.revealDeadlineSlot.toString());
  const remaining = phase === "commit" ? Math.max(0, commitDeadline - nowSlot) : phase === "reveal" ? Math.max(0, revealDeadline - nowSlot) : 0;
  const duration = Number((phase === "commit" ? show.commitSlots : show.revealSlots).toString());
  const progress = (phase === "commit" || phase === "reveal") && duration > 0 ? Math.min(100, Math.max(0, 100 * (1 - remaining / duration))) : closed ? 100 : 0;

  return (
    <section className="panel stage-grid min-h-[430px]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 animate-scan bg-gradient-to-b from-transparent via-acid/[0.025] to-transparent" />
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-acid/20 bg-acid/10 text-acid"><Icon name="radio" size={18} /></div>
          <div><div className="eyebrow mb-1">Live stage · Round {show.currentRound + 1}/{show.totalRounds}</div><h2 className="text-sm font-semibold">Quadratic track selection</h2></div>
        </div>
        <div className="flex gap-2"><Badge tone={show.cancelled ? "warn" : "live"}>{stateLabel(show.state)}</Badge><Badge tone="acid">{stateLabel(show.roundPhase)}</Badge></div>
      </header>

      <div className="relative z-10 p-5">
        <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="rounded-xl border border-line bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div><div className="eyebrow">Round clock</div><div className="mt-2 font-mono text-xl text-slate-100">{remaining.toLocaleString()} <span className="text-xs text-slate-500">slots left</span></div></div>
              <div className="text-right"><div className="eyebrow">ER slot</div><div className="mt-2 font-mono text-xs text-mint">{erSlot?.toLocaleString() ?? "—"}</div></div>
            </div>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-mint to-acid transition-all duration-500" style={{ width: `${progress}%` }} /></div>
            <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-wider text-slate-600"><span>Commit ≤ {commitDeadline || "—"}</span><span>Reveal ≤ {revealDeadline || "—"}</span></div>
          </div>
          <div className="min-w-40 rounded-xl border border-line bg-black/25 p-4">
            <div className="eyebrow">Mystery track</div>
            {result ? <><div className="mt-3 text-sm font-semibold" style={{ color: TRACK_COLORS[result.mysteryTrack] }}>{TRACK_TITLES[result.mysteryTrack]}</div><div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-slate-600">Revealed at close</div></> : <><div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-400"><Icon name="lock" size={14} /> Sealed</div><div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-slate-600">Hidden until close</div></>}
          </div>
        </div>

        <div className="space-y-3">
          {TRACK_TITLES.map((title, index) => {
            const score = scores[index];
            const width = maxScore > 0n ? Number(score * 100n / maxScore) : 0;
            const winner = result?.winnerTrack === index;
            return (
              <div key={title} className={`relative overflow-hidden rounded-xl border p-4 transition-colors ${winner ? "border-acid/40 bg-acid/[0.055]" : "border-line bg-black/20"}`}>
                <div className="absolute inset-y-0 left-0 opacity-[0.055] transition-all duration-700" style={{ width: `${width}%`, background: TRACK_COLORS[index] }} />
                <div className="relative flex items-center gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono text-xs" style={{ borderColor: `${TRACK_COLORS[index]}35`, color: TRACK_COLORS[index], background: `${TRACK_COLORS[index]}0d` }}>0{index + 1}</div>
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold text-slate-200">{title}</span>{winner ? <Badge tone="acid">Winner</Badge> : null}</div><div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600">Σ floor√pledge · Track {index}</div></div>
                  <div className="text-right"><div className="font-mono text-xl font-semibold" style={{ color: TRACK_COLORS[index] }}>{score.toString()}</div><div className="eyebrow">Score</div></div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4 font-mono text-[10px] text-slate-500">
          <span>Round pool <strong className="ml-1 font-normal text-slate-300">{formatSol(result?.pool ?? show.roundPool)} SOL</strong></span>
          <span>Escrow <strong className="ml-1 font-normal text-slate-300">{formatSol(show.escrowTotal)} SOL</strong></span>
          <span>Closed <strong className="ml-1 font-normal text-slate-300">{show.closedRounds}/{show.totalRounds}</strong></span>
        </div>
        {show.closedRounds > 0 ? <div className="mt-3 flex flex-wrap gap-2">{show.winners.slice(0, show.closedRounds).map((round, index) => <div key={index} className="rounded-md border border-line bg-black/20 px-2.5 py-1.5 font-mono text-[9px] text-slate-500">R{index + 1} · <span style={{ color: TRACK_COLORS[round.winnerTrack] }}>{TRACK_TITLES[round.winnerTrack]}</span> · {formatSol(round.pool, 3)} SOL</div>)}</div> : null}
      </div>
    </section>
  );
}
