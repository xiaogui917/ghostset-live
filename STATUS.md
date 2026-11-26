# GhostSet Live — STATUS（2026-11-26）

## 当前状态

- **US ER（devnet-us）：仍故障。** 2026-11-26 08:40 探针：
  `abort_show` 模拟仍报 `InstructionError [0, "Immutable"]`，
  故障已持续约 57.6 小时。官方状态面全绿、无事故通报。
- **EU ER（devnet-eu）：已验证可用，demo 进行中。**
  新 show `600176153334289128`
  （PDA `FjUMyQQA5ioFRqXG7cMETki1jB4FPc9661LdXWf8mtu3`）：
  delegate、VRF 请求与回调、第 1 回合 open/commit/reveal 全部成功。
  剩余：第 2–3 回合、finalize、withdraw。
- **提交计划：2026-11-26。** 比赛截止 2026-11-27 22:00 HKT。
  go/no-go：GO（EU ER 现场演示）；NO-GO（US ER）。
- **本地测试：** MagicSVM 生命周期测试通过（2026-11-26 复跑，
  1 passed / 0 failed / 1 ignored），录像在 `docs/`。
- **公开仓库：** 待主会话经浏览器建仓 `ghostset-live` 后推送
  （本地已提交，remote 待建）。

## 资金（devnet 测试 SOL）

- house `HC5JWf4Tv3A5baTzudpKECj2cr2VGdr7HgejXBsppVqT`：
  EU demo 启动时 10.9075 SOL。
- 已锁：US 两局旧 show 4.0 SOL（待 US 恢复后回收）；
  EU 新 show 2.0 SOL（demo 完成后回收）。

## 关键链接与 ID

- 程序 ID：`J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3`
- US ER：https://devnet-us.magicblock.app（验证人 MUS3hc9…，即 US 验证人本身）
- EU ER：https://devnet-eu.magicblock.app（验证人 MEUGGrYP…）
- 旧 show：`14440634207599454842` / demo show `16727413064812048144`
  （均 delegated 于 US ER，锁 2.0 SOL 各）
- 提交页：https://build.magicblock.app/?stage=blitz#submit
  （须 Telegram 登录；钱包地址填 0x93Be…e867；如需钱包连接/签名则停手）

## 待办

- [ ] EU demo 完成并记录最终状态与交易签名
- [ ] 公开仓库建仓推送（主会话浏览器）
- [ ] 向 MagicBlock 官方报障（文本见 BUG_REPORT_MAGICBLOCK.md，主会话浏览器发）
- [ ] 11-26 提交
- [ ] US ER 恢复后回收旧 show 4.0 SOL
