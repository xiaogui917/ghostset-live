import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import type { Keypair } from "@solana/web3.js";
import { EventLog } from "./components/EventLog";
import type { LogEntry } from "./components/EventLog";
import { FlowPanel } from "./components/FlowPanel";
import { SeatCard } from "./components/SeatCard";
import { Settlement } from "./components/Settlement";
import { SetupPanel } from "./components/SetupPanel";
import type { ShowSetup } from "./components/SetupPanel";
import { Stage } from "./components/Stage";
import { Badge, Button, Icon, KeyLabel } from "./components/UI";
import { ER_RPC, GhostSetClient, L1_RPC, TRACK_URIS, pledgeCommitment, showPda, vaultPda } from "./lib/client";
import type { ShowSnapshot } from "./lib/client";
import { enumKey, errorMessage, formatSol, parseSol } from "./lib/format";
import { clearPledges, loadOrCreateCrew, loadOrCreateShowId, loadPledge, makeSecret, replaceShowId, savePledge } from "./lib/keys";
import { playCue } from "./lib/sound";
import { TRACK_TITLES } from "./lib/tracks";

const initialSetup: ShowSetup = { totalRounds: "3", pledgeCap: "0.1", joinAmount: "0.5", commitSlots: "2000", revealSlots: "2000" };

export default function App() {
  const crew = useMemo(loadOrCreateCrew, []);
  const client = useMemo(() => new GhostSetClient(crew.house), [crew]);
  const balanceKeys = useMemo(() => [crew.house.publicKey, ...crew.seats.map((seat) => seat.publicKey)], [crew]);
  const [showId, setShowId] = useState(loadOrCreateShowId);
  const [snapshot, setSnapshot] = useState<ShowSnapshot | null>(null);
  const [setup, setSetup] = useState(initialSetup);
  const [selection, setSelection] = useState(Array.from({ length: 4 }, (_, index) => ({ track: index % 3, amount: "0.05" })));
  const [busy, setBusy] = useState<string | null>(null);
  const [events, setEvents] = useState<LogEntry[]>([]);
  const [sound, setSound] = useState(() => localStorage.getItem("ghostset-live:sound") !== "off");
  const eventId = useRef(0);
  const previous = useRef<ShowSnapshot | null>(null);
  const show = snapshot?.show ?? null;
  const state = show ? enumKey(show.state) : "missing";
  const phase = show ? enumKey(show.roundPhase) : "idle";

  const addEvent = useCallback((layer: LogEntry["layer"], message: string, options: { signature?: string; tone?: LogEntry["tone"] } = {}) => {
    const entry: LogEntry = {
      id: ++eventId.current,
      time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      layer,
      message,
      signature: options.signature,
      tone: options.tone,
    };
    setEvents((current) => [entry, ...current].slice(0, 120));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await client.snapshot(showId, balanceKeys);
      setSnapshot(next);
    } catch {
      return;
    }
  }, [balanceKeys, client, showId]);

  useEffect(() => {
    previous.current = null;
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!snapshot) return;
    const prior = previous.current;
    const current = snapshot.show;
    if (!prior || !prior.show) {
      if (current) addEvent(snapshot.activeLayer, `Show account synchronized · ${formatSol(current.liabilityTotal)} SOL liabilities`, { tone: "success" });
    } else if (current) {
      const before = prior.show;
      const beforeState = enumKey(before.state);
      const afterState = enumKey(current.state);
      if (beforeState !== afterState) addEvent(snapshot.activeLayer, `Show state · ${beforeState} → ${afterState}`, { tone: "success" });
      const beforeVrf = enumKey(before.vrfStatus);
      const afterVrf = enumKey(current.vrfStatus);
      if (beforeVrf !== afterVrf) addEvent("ER", `VRF status · ${beforeVrf} → ${afterVrf}`, { tone: afterVrf === "ready" ? "success" : "normal" });
      const beforePhase = enumKey(before.roundPhase);
      const afterPhase = enumKey(current.roundPhase);
      if (beforePhase !== afterPhase) addEvent("ER", `Round ${current.currentRound + 1} phase · ${beforePhase} → ${afterPhase}`);
      const joined = current.seats.filter((seat) => seat.joined).length;
      if (joined !== before.seats.filter((seat) => seat.joined).length) addEvent("L1", `${joined}/4 developer seats joined`);
      const committed = current.pledges.filter((pledge) => pledge.committed).length;
      if (committed !== before.pledges.filter((pledge) => pledge.committed).length) addEvent("ER", `${committed}/4 pledges committed`);
      const revealed = current.pledges.filter((pledge) => pledge.committed && pledge.revealed).length;
      if (revealed !== before.pledges.filter((pledge) => pledge.committed && pledge.revealed).length) addEvent("ER", `${revealed}/4 pledges revealed`);
      if (current.closedRounds > before.closedRounds) {
        const result = current.winners[current.currentRound];
        addEvent("ER", `Round ${current.currentRound + 1} closed · ${TRACK_TITLES[result.winnerTrack]} wins · ${formatSol(result.pool)} SOL distributed`, { tone: "success" });
        playCue("close", sound);
      }
    }
    if (snapshot.vault && prior?.vault && snapshot.vault.totalLiability.toString() !== prior.vault.totalLiability.toString()) {
      addEvent("L1", `Vault liability · ${formatSol(snapshot.vault.totalLiability)} SOL`);
    }
    previous.current = snapshot;
  }, [addEvent, snapshot, sound]);

  useEffect(() => {
    localStorage.setItem("ghostset-live:sound", sound ? "on" : "off");
  }, [sound]);

  const perform = useCallback(async (label: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    playCue("send", sound);
    try {
      await work();
      await refresh();
      playCue("success", sound);
    } catch (error) {
      addEvent("LOCAL", `${label} · ${errorMessage(error)}`, { tone: "error" });
      playCue("error", sound);
    } finally {
      setBusy(null);
    }
  }, [addEvent, busy, refresh, sound]);

  const send = useCallback(async (layer: "L1" | "ER", message: string, operation: () => Promise<string>) => {
    const signature = await operation();
    addEvent(layer, message, { signature, tone: "success" });
    return signature;
  }, [addEvent]);

  const requireShow = () => {
    if (!show) throw new Error("Initialize the show first");
    return show;
  };

  const initialize = () => perform("Initialize", async () => {
    const totalRounds = Number(setup.totalRounds);
    const commitSlots = Number(setup.commitSlots);
    const revealSlots = Number(setup.revealSlots);
    const pledgeCap = parseSol(setup.pledgeCap);
    const joinAmount = parseSol(setup.joinAmount);
    if (!Number.isInteger(totalRounds) || totalRounds < 1 || totalRounds > 8) throw new Error("Total rounds must be an integer from 1 to 8");
    if (!Number.isInteger(commitSlots) || !Number.isInteger(revealSlots) || commitSlots <= 0 || revealSlots <= 0 || commitSlots + revealSlots >= 60000) throw new Error("Slot windows must be positive integers totaling less than 60,000");
    if (pledgeCap.isZero() || joinAmount.lt(pledgeCap)) throw new Error("Join amount must cover at least one pledge cap");
    const beneficiaries = [crew.house.publicKey, crew.seats[0].publicKey, crew.seats[1].publicKey];
    await send("L1", `Show ${showId.toString()} initialized`, () => client.initializeShow(crew.house, showId, totalRounds, pledgeCap, new BN(commitSlots), new BN(revealSlots), [...TRACK_URIS], beneficiaries));
  });

  const joinSeat = async (index: number) => {
    requireShow();
    await send("L1", `Seat ${index + 1} joined with ${setup.joinAmount} SOL`, () => client.joinShow(crew.seats[index], showId, index, parseSol(setup.joinAmount)));
  };

  const joinAll = () => perform("Join all", async () => {
    const current = requireShow();
    for (let index = 0; index < 4; index += 1) if (!current.seats[index].joined) await joinSeat(index);
  });

  const airdrop = (index: number) => perform(index < 0 ? "House airdrop" : `Seat ${index + 1} airdrop`, async () => {
    const keypair = index < 0 ? crew.house : crew.seats[index];
    const amount = index < 0 ? 2 : 1;
    await send("L1", `${index < 0 ? "House" : `Seat ${index + 1}`} airdrop confirmed`, () => client.airdrop(keypair.publicKey, amount, 3));
  });

  const delegate = () => perform("Delegate", async () => {
    requireShow();
    await send("L1", "Show delegated to MagicBlock ER", () => client.delegateShow(crew.house, showId));
  });

  const requestVrf = () => perform("Request VRF", async () => {
    requireShow();
    await send("ER", "Scoped VRF randomness requested", () => client.requestShowRandomness(crew.house, showId, makeSecret()));
    addEvent("ER", "Waiting for the oracle callback · 180 second deadline");
    await client.waitForVrf(showId);
    addEvent("ER", "VRF seed fulfilled · every round can now derive its own seed", { tone: "success" });
  });

  const openRound = () => perform("Open round", async () => {
    const current = requireShow();
    await send("ER", `Round ${current.closedRounds + 1} opened · mystery track sealed`, () => client.openRound(crew.house, showId));
  });

  const commitSeat = async (index: number) => {
    const current = requireShow();
    const choice = selection[index];
    const amount = parseSol(choice.amount);
    if (amount.isZero() || amount.gt(current.pledgeCap)) throw new Error(`Seat ${index + 1} pledge must be positive and no greater than the cap`);
    const secret = makeSecret();
    const commitment = await pledgeCommitment(showPda(showId), current.currentRound, index, crew.seats[index].publicKey, choice.track, amount, secret);
    savePledge({ showId: showId.toString(), round: current.currentRound, seat: index, track: choice.track, amount: amount.toString(), secret });
    await send("ER", `Seat ${index + 1} pledge committed · secret retained locally`, () => client.commitPledge(crew.seats[index], showId, index, commitment));
  };

  const commitAll = () => perform("Commit all", async () => {
    const current = requireShow();
    for (let index = 0; index < 4; index += 1) if (!current.pledges[index].committed) await commitSeat(index);
  });

  const waitForReveal = async () => {
    const current = requireShow();
    if ((snapshot?.erSlot ?? 0) <= Number(current.commitDeadlineSlot.toString())) {
      addEvent("ER", `Waiting for ER slot > ${current.commitDeadlineSlot.toString()} before reveal`);
      await client.waitForErSlot(current.commitDeadlineSlot);
    }
  };

  const revealSeat = async (index: number) => {
    const current = requireShow();
    const stored = loadPledge(showId, current.currentRound, index);
    await waitForReveal();
    await send("ER", `Seat ${index + 1} revealed · ${TRACK_TITLES[stored.track]} · ${formatSol(stored.amount)} SOL`, () => client.revealPledge(crew.seats[index], showId, index, stored.track, new BN(stored.amount), stored.secret));
  };

  const revealAll = () => perform("Reveal all", async () => {
    const current = requireShow();
    if (!current.pledges.every((pledge) => pledge.committed)) throw new Error("Commit all four seats before using Reveal all");
    await waitForReveal();
    for (let index = 0; index < 4; index += 1) if (!current.pledges[index].revealed) await revealSeat(index);
  });

  const closeRound = () => perform("Close round", async () => {
    const current = requireShow();
    if ((snapshot?.erSlot ?? 0) <= Number(current.revealDeadlineSlot.toString())) {
      addEvent("ER", `Waiting for ER slot > ${current.revealDeadlineSlot.toString()} before close`);
      await client.waitForErSlot(current.revealDeadlineSlot);
    }
    await send("ER", `Round ${current.currentRound + 1} closing transaction confirmed`, () => client.closeRound(crew.house, showId));
  });

  const abortShow = () => perform("Abort show", async () => {
    const current = requireShow();
    const layer = enumKey(current.state) === "funded" ? "L1" : "ER";
    await send(layer, "Show aborted · current escrow returned to seat credit", () => client.abortShow(crew.house, showId, layer));
  });

  const finalize = () => perform("Finalize", async () => {
    requireShow();
    await send("ER", "Commit + undelegate intent confirmed on ER", () => client.finalizeShow(crew.house, showId));
    addEvent("L1", "Waiting for the finalized Show account to propagate to L1");
    await client.waitForL1Settlement(showId);
    addEvent("L1", "Show is on L1 · seat and royalty withdrawals unlocked", { tone: "success" });
  });

  const withdrawSeat = (index: number) => perform(`Seat ${index + 1} withdrawal`, async () => {
    await send("L1", `Seat ${index + 1} credit withdrawn`, () => client.withdraw(crew.seats[index], showId, "seat", index));
  });

  const withdrawBeneficiary = (signer: Keypair, index: number) => perform(`Beneficiary ${index + 1} withdrawal`, async () => {
    await send("L1", `${["DJ", "Composer", "Visual artist"][index]} royalty withdrawn`, () => client.withdraw(signer, showId, "beneficiary", index));
  });

  const newShow = () => {
    if (busy) return;
    clearPledges(showId);
    const next = replaceShowId();
    previous.current = null;
    setSnapshot(null);
    setEvents([]);
    setShowId(next);
    setSelection(Array.from({ length: 4 }, (_, index) => ({ track: index % 3, amount: "0.05" })));
    addEvent("LOCAL", `New show ${next.toString()} prepared · existing devnet keys retained`);
  };

  const beneficiarySigners = useMemo(() => {
    const available = [crew.house, ...crew.seats];
    if (!show) return [crew.house, crew.seats[0], crew.seats[1]];
    return show.beneficiaries.map((beneficiary) => available.find((keypair) => keypair.publicKey.equals(beneficiary)) ?? null);
  }, [crew, show]);

  return (
    <div className="min-h-screen bg-ink text-slate-200">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(116,230,181,0.055),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(200,246,93,0.04),transparent_28%)]" />
      <div className="relative mx-auto max-w-[1600px] px-4 pb-10 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line/70 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-end justify-center gap-[3px] rounded-xl border border-acid/25 bg-acid/10 pb-3 text-acid">{[8, 14, 10, 17, 7].map((height, index) => <span key={index} className="w-[2px] rounded-full bg-current" style={{ height }} />)}</div>
            <div><div className="text-sm font-bold tracking-[0.16em] text-slate-100">GHOSTSET <span className="text-acid">LIVE</span></div><div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-600">Sealed quadratic patronage</div></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-4 rounded-lg border border-line bg-panel/70 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-slate-500 md:flex"><span title={L1_RPC}><i className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-mint" />L1 {snapshot?.l1Slot?.toLocaleString() ?? "—"}</span><span title={ER_RPC}><i className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulseSoft rounded-full bg-acid" />ER {snapshot?.erSlot?.toLocaleString() ?? "—"}</span></div>
            <Button variant="ghost" icon={sound ? "volume" : "mute"} onClick={() => setSound((value) => !value)} className="px-2.5" aria-label={sound ? "Mute synthesized sound" : "Enable synthesized sound"} />
            <Button variant="secondary" icon="plus" disabled={Boolean(busy)} onClick={newShow}>New show</Button>
          </div>
        </header>

        <main className="pt-8">
          <div className="mb-7 grid items-end gap-6 lg:grid-cols-[1fr_auto]">
            <div><div className="eyebrow mb-3 text-mint">Solana L1 × MagicBlock Ephemeral Rollup</div><h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.045em] text-slate-100 sm:text-5xl">Sealed pledges.<br /><span className="text-acid">Loud outcomes.</span></h1><p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500">Four developer seats shape a live tracklist with quadratic patronage. Micro-rounds execute on ER; every credit and royalty settles back to Solana.</p></div>
            <div className="grid grid-cols-3 gap-2 lg:min-w-[430px]">
              <div className="rounded-xl border border-line bg-panel/60 p-3"><div className="eyebrow">Show state</div><div className="mt-2 truncate font-mono text-xs text-slate-200">{show ? enumKey(show.state) : "Not created"}</div></div>
              <div className="rounded-xl border border-line bg-panel/60 p-3"><div className="eyebrow">VRF</div><div className="mt-2 truncate font-mono text-xs text-mint">{show ? enumKey(show.vrfStatus) : "Idle"}</div></div>
              <div className="rounded-xl border border-line bg-panel/60 p-3"><div className="eyebrow">Active read</div><div className="mt-2 font-mono text-xs text-acid">{snapshot?.activeLayer ?? "L1"}</div></div>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber/15 bg-amber/[0.035] px-4 py-3">
            <div className="flex items-center gap-3 font-mono text-[10px] leading-4 text-amber/70"><Icon name="lock" size={14} /><span>DEVNET ONLY · Generated keys and pledge secrets persist in localStorage. No wallet popups. Never import mainnet keys.</span></div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[9px] text-slate-600"><span>ID {showId.toString()}</span><KeyLabel value={showPda(showId)} /><span className="text-slate-700">Show</span><KeyLabel value={vaultPda(showId)} /><span className="text-slate-700">Vault</span></div>
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="min-w-0 space-y-5">
              <Stage show={show} erSlot={snapshot?.erSlot ?? null} />
              <section>
                <div className="mb-3 flex items-center justify-between px-1"><div><div className="eyebrow mb-1">Browser-generated devnet crew</div><h2 className="text-sm font-semibold text-slate-200">Developer seats</h2></div><Badge tone="neutral">{show?.seats.filter((seat) => seat.joined).length ?? 0}/4 on-chain</Badge></div>
                <div className="grid gap-3 md:grid-cols-2">{crew.seats.map((keypair, index) => <SeatCard key={keypair.publicKey.toBase58()} index={index} keypair={keypair} balance={snapshot?.balances[index + 1] ?? 0} seat={show?.seats[index] ?? null} pledge={show?.pledges[index] ?? null} phase={phase} showState={state} joinAmount={setup.joinAmount} track={selection[index].track} amount={selection[index].amount} locked={Boolean(busy)} busy={busy === `Seat ${index + 1}` || busy === "Join all" || busy === "Commit all" || busy === "Reveal all"} onTrack={(track) => setSelection((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, track } : item))} onAmount={(amount) => setSelection((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount } : item))} onAirdrop={() => void airdrop(index)} onJoin={() => void perform(`Seat ${index + 1}`, () => joinSeat(index))} onCommit={() => void perform(`Seat ${index + 1}`, () => commitSeat(index))} onReveal={() => void perform(`Seat ${index + 1}`, () => revealSeat(index))} onWithdraw={() => void withdrawSeat(index)} />)}</div>
              </section>
              <EventLog events={events} onClear={() => setEvents([])} />
            </div>
            <aside className="space-y-5 xl:sticky xl:top-5">
              <SetupPanel setup={setup} show={show} house={crew.house} balance={snapshot?.balances[0] ?? 0} busy={busy === "House airdrop"} onChange={(key, value) => setSetup((current) => ({ ...current, [key]: value }))} onAirdrop={() => void airdrop(-1)} />
              <FlowPanel show={show} busy={Boolean(busy)} onInitialize={() => void initialize()} onJoinAll={() => void joinAll()} onDelegate={() => void delegate()} onRequestVrf={() => void requestVrf()} onOpenRound={() => void openRound()} onCommitAll={() => void commitAll()} onRevealAll={() => void revealAll()} onCloseRound={() => void closeRound()} onFinalize={() => void finalize()} onAbort={() => void abortShow()} />
              <Settlement show={show} vault={snapshot?.vault ?? null} signers={beneficiarySigners} busy={Boolean(busy)} onWithdraw={(signer, index) => void withdrawBeneficiary(signer, index)} />
            </aside>
          </div>
        </main>
        <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-line/60 pt-5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-700"><span>Program {showPda(showId) && "J51D…GM3"} · Anchor 0.32.1</span><span>Commit/reveal privacy is application-layer only · Public ER is not a TEE</span></footer>
      </div>
    </div>
  );
}
