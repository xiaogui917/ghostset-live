# GhostSet Live — STATUS（2026-11-26）

## 当前状态

- **US ER（devnet-us）：仍故障。** 2026-11-26 08:40 探针：
  `abort_show` 模拟仍报 `InstructionError [0, "Immutable"]`，
  故障已持续约 57.6 小时。官方状态面全绿、无事故通报。
- **EU ER（devnet-eu）：已验证可用，demo 已完整跑通。**
  新 show `600176153334289128`
  （PDA `FjUMyQQA5ioFRqXG7cMETki1jB4FPc9661LdXWf8mtu3`）：
  delegate、VRF 请求与回调、3 回合、finalize、7 笔 withdraw
  全部成功；show 已 closed、liabilities 0、2 SOL 已返还。
  完成时间 2026-11-26 约 08:48 HKT。
- **提交计划：2026-11-26。** 比赛截止 2026-11-27 22:00 HKT。
  go/no-go：**GO**（EU ER 现场演示已完成）；NO-GO（US ER）。
- **本地测试：** MagicSVM 生命周期测试通过（2026-11-26 复跑，
  1 passed / 0 failed / 1 ignored），录像在 `docs/`。
- **公开仓库：** https://github.com/xiaogui917/ghostset-live（已建好并推送，master HEAD c8713ed，2026-11-26 08:53 HKT）。

## 资金（devnet 测试 SOL）

- house `HC5JWf4Tv3A5baTzudpKECj2cr2VGdr7HgejXBsppVqT`：
  EU demo 启动时 10.9075 SOL。
- 已锁：US 两局旧 show 4.0 SOL（待 US 恢复后回收）；
  EU 新 show 的 2.0 SOL 已随 demo 完成全数返还（house 11.2911 SOL）。

## 关键链接与 ID

- 程序 ID：`J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3`
- US ER：https://devnet-us.magicblock.app（验证人 MUS3hc9…，即 US 验证人本身）
- EU ER：https://devnet-eu.magicblock.app（验证人 MEUGGrYP…）
- 旧 show：`14440634207599454842` / demo show `16727413064812048144`
  （均 delegated 于 US ER，锁 2.0 SOL 各）
- 提交页：https://build.magicblock.app/?stage=blitz#submit
  （须 Telegram 登录；钱包地址填 0x93Be…e867；如需钱包连接/签名则停手）

## 待办

- [x] EU demo 完成并记录最终状态与交易签名
- [x] 公开仓库建仓推送（2026-11-26 08:53 HKT，已推 master）
- [x] 向 MagicBlock 官方报障（2026-11-26 08:55 HKT，issue #344：https://github.com/magicblock-labs/ephemeral-rollups-sdk/issues/344）
- [ ] 11-26 提交（进行中：卡在 Telegram 登录确认，等大哥在 Telegram App 确认或扫码）
- [ ] US ER 恢复后回收旧 show 4.0 SOL
