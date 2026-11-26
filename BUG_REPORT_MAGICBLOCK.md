# Bug report (draft, to post to MagicBlock Discord / GitHub issue)

> 以下文本已备好，待主会话经浏览器发到 MagicBlock Discord
> （#dev-support 或 #bug-reports）或 GitHub
> magicblock-labs/ephemeral-rollups-sdk issue。发之前请把
> `[占位]` 换成实际链接。

## Title

[devnet] US Ephemeral Rollup rejects all writes to delegated accounts
with `Account is immutable` since ~2026-11-23 23:01 UTC+8 — health
checks still green, no incident on status page

## Body

### Summary

Since approximately **2026-11-23 23:01 HKT (15:01 UTC)**,
every write to a delegated account on the devnet US Ephemeral Rollup
(`https://devnet-us.magicblock.app`, validator
`MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd`) fails with
`InstructionError [0, "Immutable"]` (`Account is immutable`),
while reads work, the slot advances normally, `getHealth` returns
`"ok"`, and the official status page shows all green.

### Reproduction (read-only simulation, no real transaction)

```text
ER slot: 1163539526 -> 1163540094 (delta 568 in 5s)   # 2026-11-26 08:40 HKT
Simulate abort_show for a delegated account on the US ER:
  err: {"InstructionError":[0,"Immutable"]}
  logs: Program J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3 failed: Account is immutable
        (6882 compute units)
```

Same result on 2026-11-24 07:51 HKT and 08:36 HKT. Real transactions
fail identically. Affected: any instruction writing to a delegated
account (abort, VRF request, round open/commit/reveal, finalize).
Two of our shows (`14440634207599454842`, `16727413064812048144`)
have been stuck in `delegated` state since then, with 2.0 SOL locked
in each.

### What is NOT broken

- `getSlot` advances (~110 slots/sec); `getAccountInfo` reads work.
- `getHealth` → `{"result":"ok"}`; `getVersion` → core `2.0.5`,
  solana-core `4.2.2`.
- The **EU** ER (`https://devnet-eu.magicblock.app`, validator
  `MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e`) works fine:
  on 2026-11-26 we delegated a new account there and completed
  VRF request + callback + round writes with no errors. So the fault
  is isolated to the US region ER, not the program or the SDK.

### Status page is blind to this failure

- `https://status.magicblock.app/api/services` shows devnet-us `er`
  metrics as **0 for every day 2026-11-17 – 11-26** with
  `live_status.er = true`.
- The docs System Status page
  (`docs.magicblock.gg/pages/overview/additional-information/system-status.md`)
  is empty (only a "Network" heading).
- No incident notice found anywhere as of 2026-11-26.

The ER reports healthy while rejecting all delegated writes — a
liveness-only health signal. Suggest adding a write-path probe
(e.g. simulate a write against a delegated canary account) to the
status checks.

### Environment

- Program: `J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3`
  (Anchor 1.0.2, ephemeral-rollups-sdk 0.18.0)
- Endpoint: `https://devnet-us.magicblock.app`
- Network: Solana devnet
- Project repo: [占位：https://github.com/xiaogui917/ghostset-live]
- Full incident report: [占位：仓库内 INCIDENT_REPORT.md]

### Ask

1. Please confirm whether the US ER delegation session is known-broken
   and, if so, the ETA for a fix or a session reset.
2. Is there a supported way to migrate already-delegated accounts
   from the US ER to another region ER (undelegate path is also
   gated on ER writes in our program flow)?
