/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/ghostset_live.json`.
 */
export type GhostsetLive = {
  "address": "J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3",
  "metadata": {
    "name": "ghostsetLive",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Sealed quadratic patronage with ephemeral rounds and L1 settlement"
  },
  "instructions": [
    {
      "name": "abortShow",
      "discriminator": [
        103,
        129,
        158,
        4,
        196,
        201,
        206,
        225
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "show",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "showId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closeRound",
      "discriminator": [
        149,
        14,
        81,
        88,
        230,
        226,
        234,
        37
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "show",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "showId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "commitPledge",
      "discriminator": [
        66,
        216,
        236,
        68,
        106,
        232,
        0,
        59
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "show",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "showId",
          "type": "u64"
        },
        {
          "name": "seatIndex",
          "type": "u8"
        },
        {
          "name": "commitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "delegateShow",
      "discriminator": [
        17,
        28,
        83,
        161,
        134,
        81,
        185,
        190
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferShow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "show"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                253,
                157,
                61,
                143,
                218,
                18,
                59,
                235,
                91,
                249,
                205,
                140,
                163,
                248,
                89,
                27,
                86,
                33,
                15,
                185,
                54,
                190,
                132,
                213,
                188,
                63,
                30,
                115,
                164,
                48,
                104,
                118
              ]
            }
          }
        },
        {
          "name": "delegationRecordShow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "show"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataShow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "show"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "show",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "showId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "finalizeShow",
      "discriminator": [
        92,
        246,
        180,
        156,
        154,
        128,
        156,
        175
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "show",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "showId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeShow",
      "discriminator": [
        10,
        255,
        57,
        178,
        112,
        8,
        191,
        41
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "show",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "showId",
          "type": "u64"
        },
        {
          "name": "totalRounds",
          "type": "u8"
        },
        {
          "name": "pledgeCap",
          "type": "u64"
        },
        {
          "name": "commitSlots",
          "type": "u64"
        },
        {
          "name": "revealSlots",
          "type": "u64"
        },
        {
          "name": "tracks",
          "type": {
            "vec": {
              "defined": {
                "name": "trackInput"
              }
            }
          }
        },
        {
          "name": "beneficiaries",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    },
    {
      "name": "joinShow",
      "discriminator": [
        151,
        24,
        172,
        29,
        98,
        138,
        241,
        19
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "show",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "showId",
          "type": "u64"
        },
        {
          "name": "seatIndex",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "openRound",
      "discriminator": [
        66,
        235,
        123,
        240,
        8,
        35,
        185,
        159
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "show",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "showId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "requestShowRandomness",
      "discriminator": [
        120,
        129,
        207,
        148,
        155,
        252,
        192,
        118
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "show",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        },
        {
          "name": "oracleQueue",
          "writable": true
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "showId",
          "type": "u64"
        },
        {
          "name": "clientSeed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "revealPledge",
      "discriminator": [
        67,
        219,
        39,
        182,
        125,
        108,
        112,
        232
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "show",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "showId",
          "type": "u64"
        },
        {
          "name": "seatIndex",
          "type": "u8"
        },
        {
          "name": "track",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "secret",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "vrfCallback",
      "discriminator": [
        248,
        224,
        55,
        227,
        56,
        10,
        108,
        36
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "docs": [
            "Scoped VRF identity PDA, bound to this program. Its presence as a signer proves",
            "the callback was issued by the VRF program for this program."
          ],
          "signer": true
        },
        {
          "name": "show",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "requestNonce",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "recipient",
          "writable": true,
          "signer": true
        },
        {
          "name": "show",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "showId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "showId",
          "type": "u64"
        },
        {
          "name": "kind",
          "type": {
            "defined": {
              "name": "withdrawKind"
            }
          }
        },
        {
          "name": "index",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "show",
      "discriminator": [
        171,
        128,
        239,
        156,
        241,
        58,
        221,
        199
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "events": [
    {
      "name": "pledgeCommitted",
      "discriminator": [
        230,
        120,
        166,
        182,
        143,
        51,
        182,
        141
      ]
    },
    {
      "name": "pledgeRevealed",
      "discriminator": [
        141,
        190,
        45,
        106,
        209,
        119,
        153,
        212
      ]
    },
    {
      "name": "randomnessFulfilled",
      "discriminator": [
        61,
        67,
        128,
        142,
        15,
        77,
        223,
        252
      ]
    },
    {
      "name": "randomnessRequested",
      "discriminator": [
        10,
        64,
        183,
        29,
        104,
        63,
        90,
        149
      ]
    },
    {
      "name": "roundClosed",
      "discriminator": [
        45,
        243,
        28,
        22,
        132,
        70,
        175,
        226
      ]
    },
    {
      "name": "roundOpened",
      "discriminator": [
        99,
        173,
        228,
        72,
        142,
        57,
        109,
        178
      ]
    },
    {
      "name": "seatJoined",
      "discriminator": [
        254,
        189,
        73,
        248,
        103,
        13,
        114,
        168
      ]
    },
    {
      "name": "showAborted",
      "discriminator": [
        224,
        112,
        45,
        184,
        79,
        41,
        80,
        137
      ]
    },
    {
      "name": "showClosed",
      "discriminator": [
        142,
        15,
        65,
        75,
        65,
        182,
        29,
        201
      ]
    },
    {
      "name": "showDelegated",
      "discriminator": [
        1,
        115,
        83,
        198,
        176,
        224,
        50,
        229
      ]
    },
    {
      "name": "showFinalized",
      "discriminator": [
        215,
        56,
        112,
        122,
        213,
        235,
        83,
        118
      ]
    },
    {
      "name": "showFinalizing",
      "discriminator": [
        60,
        240,
        160,
        143,
        96,
        48,
        168,
        75
      ]
    },
    {
      "name": "showInitialized",
      "discriminator": [
        3,
        108,
        98,
        167,
        121,
        99,
        161,
        9
      ]
    },
    {
      "name": "withdrawn",
      "discriminator": [
        20,
        89,
        223,
        198,
        194,
        124,
        219,
        13
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidState",
      "msg": "The instruction is not valid in the current show state"
    },
    {
      "code": 6001,
      "name": "invalidRoundPhase",
      "msg": "The instruction is not valid in the current round phase"
    },
    {
      "code": 6002,
      "name": "showIdMismatch",
      "msg": "The show id does not match the PDA"
    },
    {
      "code": 6003,
      "name": "invalidShowOwner",
      "msg": "The show account owner is invalid"
    },
    {
      "code": 6004,
      "name": "unauthorized",
      "msg": "The signer is not authorized for this action"
    },
    {
      "code": 6005,
      "name": "showCancelled",
      "msg": "The show has been cancelled"
    },
    {
      "code": 6006,
      "name": "invalidRoundCount",
      "msg": "The round count must be between one and MAX_ROUNDS"
    },
    {
      "code": 6007,
      "name": "invalidPledgeCap",
      "msg": "The pledge cap must be positive"
    },
    {
      "code": 6008,
      "name": "invalidRoundTiming",
      "msg": "Round durations must be positive"
    },
    {
      "code": 6009,
      "name": "invalidTrackCount",
      "msg": "Exactly three tracks are required"
    },
    {
      "code": 6010,
      "name": "invalidTrackMetadata",
      "msg": "Track metadata is empty or exceeds its fixed buffer"
    },
    {
      "code": 6011,
      "name": "invalidBeneficiaryCount",
      "msg": "Exactly three beneficiaries are required"
    },
    {
      "code": 6012,
      "name": "invalidBeneficiary",
      "msg": "The beneficiary or beneficiary index is invalid"
    },
    {
      "code": 6013,
      "name": "duplicateBeneficiary",
      "msg": "Beneficiaries must be distinct"
    },
    {
      "code": 6014,
      "name": "invalidRoyaltyBps",
      "msg": "Royalty basis points must sum to exactly 10000"
    },
    {
      "code": 6015,
      "name": "invalidSeat",
      "msg": "The seat index is invalid"
    },
    {
      "code": 6016,
      "name": "seatAlreadyJoined",
      "msg": "The seat has already joined"
    },
    {
      "code": 6017,
      "name": "seatNotJoined",
      "msg": "The seat has not joined"
    },
    {
      "code": 6018,
      "name": "duplicateSeat",
      "msg": "A seat authority may join only once"
    },
    {
      "code": 6019,
      "name": "seatsNotFilled",
      "msg": "All four seats must join before delegation"
    },
    {
      "code": 6020,
      "name": "insufficientDeposit",
      "msg": "The initial deposit must cover at least one pledge cap"
    },
    {
      "code": 6021,
      "name": "insufficientCredit",
      "msg": "The seat does not have enough credit"
    },
    {
      "code": 6022,
      "name": "alreadyCommitted",
      "msg": "The seat has already committed in this round"
    },
    {
      "code": 6023,
      "name": "notCommitted",
      "msg": "The seat has not committed in this round"
    },
    {
      "code": 6024,
      "name": "alreadyRevealed",
      "msg": "The seat has already revealed in this round"
    },
    {
      "code": 6025,
      "name": "invalidCommitment",
      "msg": "The commitment must be nonzero"
    },
    {
      "code": 6026,
      "name": "invalidReveal",
      "msg": "The reveal does not match the domain-separated commitment"
    },
    {
      "code": 6027,
      "name": "invalidTrack",
      "msg": "The track index is invalid"
    },
    {
      "code": 6028,
      "name": "invalidPledgeAmount",
      "msg": "The pledge amount must be positive and no greater than the cap"
    },
    {
      "code": 6029,
      "name": "commitPhaseClosed",
      "msg": "The commit phase has closed"
    },
    {
      "code": 6030,
      "name": "revealPhaseNotOpen",
      "msg": "The reveal phase has not opened"
    },
    {
      "code": 6031,
      "name": "revealPhaseClosed",
      "msg": "The reveal phase has closed"
    },
    {
      "code": 6032,
      "name": "roundNotClosable",
      "msg": "The reveal deadline has not passed"
    },
    {
      "code": 6033,
      "name": "roundAlreadyOpen",
      "msg": "A round is already open"
    },
    {
      "code": 6034,
      "name": "roundNotOpen",
      "msg": "No round is open"
    },
    {
      "code": 6035,
      "name": "noRoundsRemaining",
      "msg": "No rounds remain"
    },
    {
      "code": 6036,
      "name": "showNotFinalizable",
      "msg": "The show is not ready to finalize"
    },
    {
      "code": 6037,
      "name": "showAlreadyFinalized",
      "msg": "Finalization has already been scheduled"
    },
    {
      "code": 6038,
      "name": "vrfAlreadyRequested",
      "msg": "Randomness has already been requested"
    },
    {
      "code": 6039,
      "name": "vrfNotRequested",
      "msg": "No randomness request is pending"
    },
    {
      "code": 6040,
      "name": "vrfRequestMismatch",
      "msg": "The callback nonce does not match the pending request"
    },
    {
      "code": 6041,
      "name": "vrfCallbackExpired",
      "msg": "The randomness callback arrived after its accepted deadline"
    },
    {
      "code": 6042,
      "name": "vrfNotReady",
      "msg": "Randomness is not ready"
    },
    {
      "code": 6043,
      "name": "invalidOracleQueue",
      "msg": "The oracle queue does not match the ER runtime"
    },
    {
      "code": 6044,
      "name": "mathOverflow",
      "msg": "Checked arithmetic overflowed or underflowed"
    },
    {
      "code": 6045,
      "name": "liabilityMismatch",
      "msg": "The tracked liabilities do not match the account details"
    },
    {
      "code": 6046,
      "name": "insufficientVaultFunds",
      "msg": "The vault does not cover all outstanding liabilities"
    },
    {
      "code": 6047,
      "name": "vaultRentViolation",
      "msg": "The vault rent-exempt minimum cannot be spent"
    },
    {
      "code": 6048,
      "name": "nothingToWithdraw",
      "msg": "There is no balance to withdraw"
    }
  ],
  "types": [
    {
      "name": "pledge",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "committed",
            "type": "bool"
          },
          {
            "name": "revealed",
            "type": "bool"
          },
          {
            "name": "forfeited",
            "type": "bool"
          },
          {
            "name": "track",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "escrow",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "pledgeCommitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "roundIndex",
            "type": "u8"
          },
          {
            "name": "seatIndex",
            "type": "u8"
          },
          {
            "name": "escrow",
            "type": "u64"
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "pledgeRevealed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "roundIndex",
            "type": "u8"
          },
          {
            "name": "seatIndex",
            "type": "u8"
          },
          {
            "name": "track",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "randomnessFulfilled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "randomSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "randomnessRequested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "callerSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "roundClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "roundIndex",
            "type": "u8"
          },
          {
            "name": "winnerTrack",
            "type": "u8"
          },
          {
            "name": "scores",
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "pool",
            "type": "u64"
          },
          {
            "name": "royalties",
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          }
        ]
      }
    },
    {
      "name": "roundOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "roundIndex",
            "type": "u8"
          },
          {
            "name": "mysteryTrack",
            "type": "u8"
          },
          {
            "name": "roundSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "commitDeadlineSlot",
            "type": "u64"
          },
          {
            "name": "revealDeadlineSlot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "roundPhase",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "idle"
          },
          {
            "name": "commit"
          },
          {
            "name": "reveal"
          },
          {
            "name": "closed"
          }
        ]
      }
    },
    {
      "name": "roundResult",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "winnerTrack",
            "type": "u8"
          },
          {
            "name": "mysteryTrack",
            "type": "u8"
          },
          {
            "name": "scores",
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "pool",
            "type": "u64"
          },
          {
            "name": "royalties",
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          }
        ]
      }
    },
    {
      "name": "seat",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "credit",
            "type": "u64"
          },
          {
            "name": "joined",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "seatJoined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "seatIndex",
            "type": "u8"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "show",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "showId",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "showState"
              }
            }
          },
          {
            "name": "vrfStatus",
            "type": {
              "defined": {
                "name": "vrfStatus"
              }
            }
          },
          {
            "name": "roundPhase",
            "type": {
              "defined": {
                "name": "roundPhase"
              }
            }
          },
          {
            "name": "totalRounds",
            "type": "u8"
          },
          {
            "name": "currentRound",
            "type": "u8"
          },
          {
            "name": "closedRounds",
            "type": "u8"
          },
          {
            "name": "cancelled",
            "type": "bool"
          },
          {
            "name": "finalizeScheduled",
            "type": "bool"
          },
          {
            "name": "pledgeCap",
            "type": "u64"
          },
          {
            "name": "commitSlots",
            "type": "u64"
          },
          {
            "name": "revealSlots",
            "type": "u64"
          },
          {
            "name": "seats",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "seat"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "tracks",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "track"
                  }
                },
                3
              ]
            }
          },
          {
            "name": "beneficiaries",
            "type": {
              "array": [
                "pubkey",
                3
              ]
            }
          },
          {
            "name": "royaltyBps",
            "type": {
              "array": [
                "u16",
                3
              ]
            }
          },
          {
            "name": "royaltyPending",
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "royaltyPendingTotal",
            "type": "u64"
          },
          {
            "name": "creditTotal",
            "type": "u64"
          },
          {
            "name": "escrowTotal",
            "type": "u64"
          },
          {
            "name": "roundPool",
            "type": "u64"
          },
          {
            "name": "liabilityTotal",
            "type": "u64"
          },
          {
            "name": "pledges",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "pledge"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "commitDeadlineSlot",
            "type": "u64"
          },
          {
            "name": "revealDeadlineSlot",
            "type": "u64"
          },
          {
            "name": "roundOpen",
            "type": "bool"
          },
          {
            "name": "mysteryTrack",
            "type": "u8"
          },
          {
            "name": "roundSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "winners",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "roundResult"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "randomSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "vrfRequestNonce",
            "type": "u64"
          },
          {
            "name": "vrfCallerSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "vrfRequestedAt",
            "type": "i64"
          },
          {
            "name": "lastProgressSlot",
            "type": "u64"
          },
          {
            "name": "validator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "showAborted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "refunded",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "showClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "showDelegated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "validator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "showFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "liabilityTotal",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "showFinalizing",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "cancelled",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "showInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "showId",
            "type": "u64"
          },
          {
            "name": "totalRounds",
            "type": "u8"
          },
          {
            "name": "pledgeCap",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "showState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "uninitialized"
          },
          {
            "name": "funded"
          },
          {
            "name": "delegated"
          },
          {
            "name": "vrfReady"
          },
          {
            "name": "running"
          },
          {
            "name": "finalizing"
          },
          {
            "name": "onL1"
          },
          {
            "name": "closed"
          }
        ]
      }
    },
    {
      "name": "track",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "uri",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "uriLen",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "trackInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "uri",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "uriLen",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "showId",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "rentMinimum",
            "type": "u64"
          },
          {
            "name": "totalLiability",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vrfStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "idle"
          },
          {
            "name": "requested"
          },
          {
            "name": "ready"
          },
          {
            "name": "aborted"
          }
        ]
      }
    },
    {
      "name": "withdrawKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "seat"
          },
          {
            "name": "beneficiary"
          }
        ]
      }
    },
    {
      "name": "withdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "show",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "withdrawKind"
              }
            }
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
