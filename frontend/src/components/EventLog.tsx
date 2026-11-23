import { Badge, Button, Panel } from "./UI";

export interface LogEntry {
  id: number;
  time: string;
  layer: "L1" | "ER" | "LOCAL";
  message: string;
  signature?: string;
  tone?: "normal" | "success" | "error";
}

export function EventLog({ events, onClear }: { events: LogEntry[]; onClear: () => void }) {
  return (
    <Panel title="Event stream" eyebrow="Actions + polled Show/Vault transitions" action={<Button variant="ghost" onClick={onClear} className="min-h-7 px-2 py-1">Clear</Button>}>
      <div className="log-scroll max-h-80 min-h-48 overflow-y-auto p-3">
        {events.length === 0 ? <div className="flex min-h-44 items-center justify-center font-mono text-[10px] uppercase tracking-widest text-slate-600">Waiting for chain activity</div> : <div className="space-y-1">{events.map((event) => <div key={event.id} className="grid grid-cols-[62px_42px_1fr] gap-2 rounded-lg px-2 py-2 font-mono text-[10px] leading-4 transition-colors hover:bg-white/[0.025] sm:grid-cols-[72px_48px_1fr]">
          <span className="text-slate-600">{event.time}</span>
          <Badge tone={event.tone === "error" ? "warn" : event.tone === "success" ? "acid" : event.layer === "ER" ? "live" : "neutral"}>{event.layer}</Badge>
          <div className="min-w-0 text-slate-400"><span className={event.tone === "error" ? "text-red-300" : event.tone === "success" ? "text-slate-200" : ""}>{event.message}</span>{event.signature ? <span className="ml-1 text-slate-600">· {event.layer === "L1" ? <a className="hover:text-mint" href={`https://explorer.solana.com/tx/${event.signature}?cluster=devnet`} target="_blank" rel="noreferrer">{event.signature.slice(0, 12)}…</a> : event.signature.slice(0, 12) + "…"}</span> : null}</div>
        </div>)}</div>}
      </div>
    </Panel>
  );
}
