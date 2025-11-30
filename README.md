# VeilSwap

Confidential constant-rate swapping between mBTC and mUSDC built on Zama's FHEVM. Balances, approvals, and swap amounts remain encrypted end to end while still delivering a predictable 1 mBTC = 100000 mUSDC rate.

## Overview
- Two ERC-7984 tokens (mBTC and mUSDC) with encrypted balances and faucet minting for testing.
- A minimal swap contract that converts between the tokens at a fixed rate without revealing amounts.
- A React + Vite frontend that fetches encrypted balances, lets users decrypt them on demand, grants operator rights, pulls from faucets, and executes swaps.
- Deployments and ABIs are produced with `hardhat-deploy` and consumed directly by the frontend (no mock data, no localstorage, no frontend env vars).

## Why VeilSwap
- **End-to-end privacy**: Uses FHE types so balances, approvals, and swap flows stay encrypted.
- **Deterministic pricing**: Fixed rate removes slippage and oracle dependencies, simplifying audits and UX.
- **User-first controls**: One-click operator grant, faucets for both assets, and explicit opt-in decryption.
- **Simple operations**: Owner-only `seedLiquidity` helper refreshes pool balances via token faucets.

## Tech Stack
- **Smart contracts**: Solidity 0.8.27, ERC-7984 tokens, Zama FHEVM (`@fhevm/solidity`), OpenZeppelin Ownable.
- **Tooling**: Hardhat + `hardhat-deploy`, TypeScript, `@fhevm/hardhat-plugin`, Ethers v6, TypeChain, Hardhat tasks.
- **Frontend**: React + Vite, RainbowKit + wagmi + viem (reads) and ethers (writes), Zama relayer SDK for encryption/decryption. Styling uses vanilla CSS (no Tailwind).

## Problem We Solve
Traditional swaps leak balances, allowances, and amounts to mempools and indexers. VeilSwap keeps that data encrypted while preserving deterministic pricing:
- Balances stay hidden until a user explicitly decrypts.
- Swap amounts are processed inside FHE circuits, so intermediaries cannot infer position sizes.
- Fixed-rate logic prevents MEV via price manipulation and simplifies compliance reviews.

## Architecture
- **ERC7984Bitcoin** (`contracts/ERC7984Bitcoin.sol`): mBTC token, faucet mints 1 mBTC (1e6 units) per call.
- **ERC7984USDC** (`contracts/ERC7984USDC.sol`): mUSDC token, faucet mints 10000 mUSDC (1e6 units) per call.
- **VeilSwap** (`contracts/VeilSwap.sol`): Fixed-rate swap, emits `Swapped` and `LiquiditySeeded`, exposes encrypted balances, and never reads `msg.sender` inside view functions. The rate is constant: `BTC_TO_USDC_RATE = 100000`.
- **Tasks** (`tasks/VeilSwap.ts`): Helpers to print addresses, grant operator rights, perform swaps, and seed liquidity on any network.
- **Frontend** (`app/src`): `SwapApp` shows encrypted handles via viem, decrypts through the relayer SDK, calls faucets, grants operator rights, and executes swaps via ethers. ABIs come from `deployments/sepolia` artifacts.

## Repository Layout
```
contracts/        # ERC-7984 tokens and VeilSwap logic
deploy/           # hardhat-deploy script (deploy.ts)
deployments/      # Network artifacts + ABIs (frontend copies from here)
tasks/            # Hardhat task helpers for swaps and operator setup
test/             # FHEVM mock-based unit tests
app/              # React frontend (no env vars; uses viem for reads, ethers for writes)
docs/             # Zama FHEVM reference material
```

## Getting Started (Contracts)
- Requirements: Node.js ≥ 20, npm, and a funded `PRIVATE_KEY` (no MNEMONIC) plus `INFURA_API_KEY`.
- Install dependencies:
  ```bash
  npm install
  ```
- Configure environment in `.env` (loaded via `dotenv`): `PRIVATE_KEY`, `INFURA_API_KEY`, optional `ETHERSCAN_API_KEY`, `REPORT_GAS`.
- Compile and test (tests run on the FHEVM mock; they skip if the mock is disabled):
  ```bash
  npm run compile
  npm run test
  ```
- Start a local node and deploy locally:
  ```bash
  npm run chain              # starts hardhat node without auto-deploy
  npm run deploy:localhost
  ```
- Deploy to Sepolia (uses `process.env.PRIVATE_KEY` + `INFURA_API_KEY`):
  ```bash
  npm run deploy:sepolia
  ```
  After deployment, copy the generated ABIs/addresses from `deployments/sepolia` into the frontend config if they changed.

### Useful Tasks
- Print addresses: `npx hardhat swap:addresses --network sepolia`
- Grant VeilSwap operator rights for your signer: `npx hardhat swap:set-operator --hours 720 --network sepolia`
- Swap via CLI (mock/local): `npx hardhat swap:btc --value 0.1 --network localhost`
- Seed liquidity (owner only): `npx hardhat swap:seed --btc 5 --usdc 5 --network sepolia`

## Frontend Usage (`app/`)
- Install and run:
  ```bash
  cd app
  npm install
  npm run dev
  ```
- Connect a Sepolia wallet with RainbowKit, hit the faucets for mBTC/mUSDC, grant VeilSwap operator rights, enter an amount, and swap. Encrypted balances can be decrypted on demand; no data is persisted in localstorage and no frontend env vars are required.
- Reads use viem, writes use ethers, and encryption/decryption flows use the Zama relayer SDK instantiated in `useZamaInstance`.

## Testing and Quality
- Unit tests: `npm run test` (runs against the FHEVM mock; skipped otherwise).
- Coverage: `npm run coverage`
- Linting/formatting: `npm run lint` and `npm run prettier:check`
- Typechain generation happens automatically after compile via `npm run typechain`.

## Future Plans
- Add dynamic pricing with oracle feeds while preserving encrypted inputs.
- Extend to additional encrypted assets and multi-hop routing.
- Hardening: formal verification of fixed-rate math and broader test vectors on real coprocessors.
- UX: transaction history with encrypted metadata, better error surfaces, and mobile-focused flows.
- Infrastructure: deploy relayer/KMS monitoring and auto-refresh liquidity strategies.
