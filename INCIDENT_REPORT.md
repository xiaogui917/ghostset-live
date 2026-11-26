# GhostSet Live — devnet US 共享 ER 写故障事故报告（定稿）

> 定稿：2026-11-26 HKT。仅含已实测 / 已核实记录；未含推测。
> 供 Solana Blitz（MagicBlock）11-26 提交与 go/no-go 决策使用。
> 如 US ER 恢复，以最新实测为准更新 §2、§8。

## 1. 基本信息

- 项目：GhostSet Live（Solana Blitz / MagicBlock 参赛作品）
- 程序 ID：`J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3`
- 网络：Solana devnet；共享 Ephemeral Rollup（ER）端点
  - US（故障）：`https://devnet-us.magicblock.app`，验证人
    `MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd`
  - EU（已验证可用）：`https://devnet-eu.magicblock.app`，验证人
    `MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e`
- 比赛截止：2026-11-27 22:00 HKT；提交：2026-11-26
- 参赛钱包（收款 / 报名）：`0x93Be7f04DE2FD79379F910f598D13e16E5d8e867`
  （devnet house 钱包与之无关，见 §6）

## 2. 故障现象（已实测）

- 故障起始：约 2026-11-23 23:01 HKT 起，devnet US 共享 ER 上所有写操作失败。
- 报错（模拟复现，与真实报错一致）：
  `InstructionError [0, "Immutable"]`，日志：
  `Program J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3 failed: Account is immutable`
  （指令 `AbortShow`，约 6882 CU）。
- 探针记录（只读模拟，全程不发真实交易，脚本 `scripts/er-probe.mjs`）：
  - 2026-11-24 07:51 HKT：失败；ER slot 5 秒前进 558。
  - 2026-11-24 08:36 HKT：失败；ER slot 5 秒前进 553。
  - 2026-11-26 08:40 HKT：失败；ER slot 1163539526 → 1163540094
    （5 秒前进 568）；`abort_show` 模拟仍报 `InstructionError [0, "Immutable"]`。
  - 截至 2026-11-26 08:40 HKT，故障已持续约 **57.6 小时**。
- 受影响对象：
  - 旧 show `14440634207599454842`：状态 delegated，锁 2.0 SOL；
  - demo show `16727413064812048144`：状态 delegated，vrf idle，锁 2.0 SOL；
  - `requestVrf` 在 US ER 上两次失败，VRF 回调在 US ER 上至今未端到端验证通过。
- 链本身活着：US ER slot 正常前进，读操作正常；
  `getHealth` 返回 `"ok"`，`getVersion` 返回 core `2.0.5` /
  solana-core `4.2.2`。故障是“委托账户写被拒”，不是链停，
  也不是进程宕机——属于委托会话层故障，健康检查无法发现。

## 3. 官方状态面是盲的（已核实）

- `https://status.magicblock.app/api/services`（2026-11-26 实测）：
  devnet-us 的 `er` 指标在 2026-11-17 至 11-26 每天均为 0，
  `live_status.er = true`。同一接口显示 devnet-eu 的 `er` 在
  11-23 有 5、11-24 有 4；devnet-as 在 11-23 有 8——US 的故障在
  官方状态面上完全不可见。
- 官方文档 System Status 页
  （`docs.magicblock.gg/pages/overview/additional-information/system-status.md`）
  2026-11-26 实测为空白（仅一个 "Network" 标题，无内容）。
- 公开搜索（2026-11-26）未见 MagicBlock 官方就本次 US ER 故障发布
  任何事故通报；也没有第三方状态页报告此事。
- 结论：这是一起“官方状态全绿、实际写全拒”的静默故障；
  已准备报障文本（见 `BUG_REPORT_MAGICBLOCK.md`），待提交至
  MagicBlock Discord / GitHub issue。

## 4. 备用验证人核实结果（Path B 已证伪）

- `MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd` **就是 US 区域
  ER 自己的验证人身份**（MagicBlock 官方文档与技能库的区域对照表），
  不是一条备用路径。“只改验证人参数”等于仍走同一台故障 US ER。
- 它不在 devnet L1 `cluster-nodes` 列表里（2026-11-26 实测，151 个节点），
  但这不说明任何问题：ER 验证人不是 L1 集群节点，本来就不在该列表里。
  早前“不在节点列表”的记录不作为判断依据，特此纠正。
- 直接向 DLP（`DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`）委托一个
  普通 system 账户的尝试被拒：`InvalidAccountOwner`——DLP 只接受
  支持委托的程序所拥有的账户，system 账户不可委托。
  因此 EU ER 的写健康无法用“廉价探针”验证，只能走真实 demo 流程验证。

## 5. 已完成的修复与验证（故障发生前 / 故障中）

- 2026-11-23 22:56 HKT：程序重部署成功，程序 ID 不变；
  VRF 回调修复完成，Gemini 审计通过；finalize 修复已在两局旧 show 上实证有效。
- 本地 MagicSVM 0.3.0 全生命周期测试通过（2026-11-26 复跑）：
  `cargo +stable test --manifest-path tests-magicsvm-rs/Cargo.toml` ——
  `minimal_delegate_er_write_commit_undelegate_lifecycle ... ok`
  （1 passed，0 failed；VRF 回调测试 1 ignored——MagicSVM 0.3.0 不履行
  scoped VRF 请求，VRF 以 devnet 真实预言机为准）。
  终端录像：`docs/magicsvm-20261126.typescript`（及 `.log`）。
- 探针脚本 `scripts/er-probe.mjs`：只读模拟，不发真实交易。
  注意：Anchor 0.32.1 的 SimulateError 的 `message` 恒为空串，
  真实 verdict 在 `e.simulationResponse` 里，勿以 `e.message` 判读。

## 6. 资金（devnet 测试 SOL，无市场价）

- house 钱包 `HC5JWf4Tv3A5baTzudpKECj2cr2VGdr7HgejXBsppVqT`：
  2026-11-24 08:47 实测 10.92255808 SOL；2026-11-26 EU demo 启动时
  10.9075 SOL。4 个座位钱包各约 0.6 SOL。
- 已锁：
  - US ER 两局旧 show 各 2.0 SOL，共 4.0 SOL（待 US ER 恢复后
    `recover-show.mjs`：abort → finalize → withdraw 回收）；
  - EU ER 新 show `600176153334289128` 2.0 SOL（demo 进行中，
    完成后 finalize + withdraw 回收）。
- 硬停条件未触发：可用余额始终高于 2.5 SOL。

## 7. 解决路径：EU ER 已验证可用（2026-11-26）

- 2026-11-26 约 08:47 HKT 起，在 EU ER
  （`https://devnet-eu.magicblock.app`，验证人
  `MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e`）上用
  `GHOSTSET_VALIDATOR` / `GHOSTSET_ER_RPC` 重新跑完整 demo
  （脚本 `scripts/demo-show.mjs`，新 show ID `600176153334289128`，
  Show PDA `FjUMyQQA5ioFRqXG7cMETki1jB4FPc9661LdXWf8mtu3`）：
  - L1 initialize + 4 座位 join 成功（liabilities 2 SOL）；
  - L1 delegate 到 EU 验证人成功；
  - **EU ER `request_show_randomness` 成功，VRF 回调已送达，
    状态 `vrfReady / vrf=ready`**——这是自 11-23 23:01 以来
    第一次成功的 ER 写 + VRF 回调；
  - 第 1–3 回合 open / commit / reveal / close 全部在 EU ER 上成功
    （第 1 回合胜者 Neon Arithmetic，第 2 回合 Glass Cathedral，
    第 3 回合 Midnight Signal；VRF 谜题曲各回合均已揭示）；
  - `finalize_show`（commit + undelegate）成功，show 回到 L1，
    状态 `onL1`；随后 7 笔 withdraw（4 座位 credit + DJ / 作曲 /
    视觉版税）全部成功，liabilities 2 SOL → 0 SOL，
    show 最终状态 `closed`。
  - 链上复核（2026-11-26 约 09:05 HKT）：show 在 L1 上
    `state=closed, vrf=ready, closedRounds=3, liabilities=0`；
    house 余额 10.9075 → 11.2911 SOL，4 座位合计约 2.004 SOL，
    全队总额 13.307 → 13.295 SOL（差额约 0.012 SOL 为交易费），
    2 SOL 托管金已全数返还。
  - 唯一瑕疵：demo 脚本最后一步读 vault 结算汇总时报
    `Account not found: Vault`——因最终 withdraw 后 vault 数据
    已不再是可解码的 Vault 结构（账户本身仍在，余 rent
    817,880 lamports）。业务流本身 100% 完成，属脚本收尾打印
    的容错问题，不影响演示结论；已记为后续修复项。
  - 完整终端日志：`docs/eu-demo-20261126.log`，视频见 `docs/eu-demo-20261126.mp4`。
- 结论：故障孤立在 US 区域 ER；EU 区域 ER 读写、VRF 均正常。
  项目已切换到 EU ER 做完整现场演示，不再依赖 US ER。

## 8. go/no-go（2026-11-26）

- **GO（EU ER 现场演示）**：EU demo 已于 2026-11-26 约 09:05 HKT
  完整跑通（3 回合 + finalize + 7 笔 withdraw，liabilities 归零，
  show 已 closed，资金已返还）。以 EU show 的完整流程记录
  + 本报告 + 公开仓库提交。
- **NO-GO（US ER 现场演示）**：US ER 写故障已持续约 57.6 小时，
  官方状态面全绿、无事故通报；旧 show 的 2.0 SOL 回收与 demo show
  的 VRF 验证在 US ER 恢复前无法完成。
- 降级预案（本地 MagicSVM 录像 + 本报告 + 公开仓库）已就绪；
  EU demo 已完成，不再需要降级提交。

## 9. 待办

- [x] 最新 ER 探针（2026-11-26 08:40）：仍失败，US ER 未恢复
- [x] 官方渠道事故通报核查（文档 / Discord / 状态 API）：无通报，状态面盲区已证实
- [ ] 向官方报障：文本已备好（`BUG_REPORT_MAGICBLOCK.md`），待主会话经浏览器发 Discord / GitHub issue
- [x] 备用验证人独立端点：MUS3hc9 即 US 验证人本身，无独立端点；B 路关闭
- [x] EU demo 完成并记录最终状态（show closed、liabilities 0、
      资金已返还；日志 `docs/eu-demo-20261126.log`、视频
      `docs/eu-demo-20261126.mp4`）
- [ ] 公开仓库 ghostset-live 建仓推送（待主会话经浏览器建仓）
- [ ] 11-26 提交（提交页须 Telegram 登录；钱包地址填 0x93Be…e867；如需钱包连接/签名则停手）
- [ ] US ER 恢复后：回收两局旧 show 的 4.0 SOL，复验 demo show 的 requestVrf

## 10. 来源

- 探针与会诊记录：`scripts/er-probe.mjs`、`scripts/eu-write-probe.mjs`、
  `scripts/demo-show.mjs`、`consult-kimi-20261124.md`、`consult-gemini-20261124.md`
- 探针日志：`docs/er-probe-20261126.log`、`docs/eu-write-probe-20261126.log`、
  `docs/eu-demo-20261126.log`（视频 `docs/eu-demo-20261126.mp4`）
- 当日记录：`~/workspace/agent-earn/state.md`（2026-11-26 Blitz 条）、
  `STATUS.md`
