# Pinned Ledger emulator applications

`npm run speculos:up` starts real Ledger applications in the official Speculos Docker image. Docker Desktop must be running. Both HTTP ports bind only to loopback: Sync5001 and Ethereum5002. The containers mount only these public binaries, their launcher and a private local development seed. They cannot read the app env files, Ring credentials or Circle session. No mainnet or physical-device security is claimed.

The bootstrap generates a private random 64-byte test seed in ignored `data/speculos/device.seed` with mode0600 and reuses it. It never prints the seed or silently rotates an existing identity. Back it up privately if you enroll a Ring; deleting it changes your controller and recovery identity. The seed is loaded inside the container, not placed in Docker command arguments. This remains software-held test material, not secure-element protection. Never import a real wallet recovery phrase.

## Sources and checksums

- Speculos image: `ghcr.io/ledgerhq/speculos@sha256:6ed9eefd51cddd862b746719af4cd7a3265fe43d0588c388359753cab8d46d11`.
- `apps/sync.elf`: Ledger Sync1.2.2, NanoS+, API26. Official LedgerHQ/app-ledger-sync develop commit `0838f1c1a1c591be7fe9f977c265cd3f45d58a9c`, GitHub Actions artifact9942427075. Downloaded archive SHA256 `9c13358822986ee15f1e3c4a903669ea8cef354f0871d4430b6ac5f77277e496` matched GitHub's reported digest. ELF SHA256 `37741387a436ccb043312da5c1943d64ff61dbcedb7af8d6add7211046b09d6c`.
- `apps/ethereum.elf`: official [LedgerHQ/app-ethereum1.22.3 release](https://github.com/LedgerHQ/app-ethereum/releases/tag/1.22.3), asset `app-1.22.3-nanos2.elf`. SHA256 `d8631ab43961928851e66175bef6d0157e5c516389b8b61bdb3c239a8125944e`.

The unmodified public binaries are included so setup does not depend on expiring Actions artifacts. Their Apache2 licenses are retained alongside this file; sources are available at the pinned repositories/refs above. `npm run speculos:prepare` checks both binary hashes before startup. No production attestation private key is included; Sync uses Ledger's public development attestation.

See [complete setup](../../docs/speculos-setup.md) and the [disclosed CLI source adapter](../ledger-speculos/README.md).
