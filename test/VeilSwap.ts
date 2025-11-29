import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  ERC7984Bitcoin,
  ERC7984Bitcoin__factory,
  ERC7984USDC,
  ERC7984USDC__factory,
  VeilSwap,
  VeilSwap__factory,
} from "../types";

type SignerSet = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

describe("VeilSwap", function () {
  let signers: SignerSet;
  let mbtc: ERC7984Bitcoin;
  let musdc: ERC7984USDC;
  let swap: VeilSwap;

  before(function () {
    if (!fhevm.isMock) {
      console.warn("VeilSwap unit tests only run against the local FHE mock");
      this.skip();
    }
  });

  beforeEach(async function () {
    const [deployer, alice, bob] = (await ethers.getSigners()) as HardhatEthersSigner[];
    signers = { deployer, alice, bob };

    const mbtcFactory = (await ethers.getContractFactory("ERC7984Bitcoin")) as ERC7984Bitcoin__factory;
    mbtc = (await mbtcFactory.deploy()) as ERC7984Bitcoin;

    const musdcFactory = (await ethers.getContractFactory("ERC7984USDC")) as ERC7984USDC__factory;
    musdc = (await musdcFactory.deploy()) as ERC7984USDC;

    const swapFactory = (await ethers.getContractFactory("VeilSwap")) as VeilSwap__factory;
    swap = (await swapFactory.deploy(await mbtc.getAddress(), await musdc.getAddress())) as VeilSwap;

    await swap.connect(signers.deployer).seedLiquidity(3, 3);
  });

  async function encryptAmount(user: HardhatEthersSigner, amount: bigint) {
    return fhevm.createEncryptedInput(await swap.getAddress(), user.address).add64(amount).encrypt();
  }

  async function decryptBalance(
    token: ERC7984Bitcoin | ERC7984USDC,
    owner: HardhatEthersSigner,
  ): Promise<bigint> {
    const encrypted = await token.confidentialBalanceOf(owner.address);
    return fhevm.userDecryptEuint(FhevmType.euint64, encrypted, await token.getAddress(), owner);
  }

  it("swaps encrypted mBTC to mUSDC", async function () {
    await mbtc.connect(signers.alice).faucet();
    const expiry = Math.floor(Date.now() / 1000) + 60 * 60;
    await mbtc.connect(signers.alice).setOperator(await swap.getAddress(), expiry);

    const swapAmount = ethers.parseUnits("0.25", 6);
    const encrypted = await encryptAmount(signers.alice, swapAmount);

    await swap.connect(signers.alice).swapMbtcForMusdc(encrypted.handles[0], encrypted.inputProof);

    const btcBalance = await decryptBalance(mbtc, signers.alice);
    const usdcBalance = await decryptBalance(musdc, signers.alice);
    const faucetAmount = ethers.parseUnits("1", 6);

    expect(btcBalance).to.equal(faucetAmount - swapAmount);
    expect(usdcBalance).to.equal(swapAmount * 100000n);
  });

  it("swaps encrypted mUSDC to mBTC", async function () {
    await musdc.connect(signers.alice).faucet();
    await swap.connect(signers.deployer).seedLiquidity(2, 0);

    const expiry = Math.floor(Date.now() / 1000) + 60 * 60;
    await musdc.connect(signers.alice).setOperator(await swap.getAddress(), expiry);

    const swapAmount = ethers.parseUnits("1000", 6);
    const encrypted = await encryptAmount(signers.alice, swapAmount);

    await swap.connect(signers.alice).swapMusdcForMbtc(encrypted.handles[0], encrypted.inputProof);

    const btcBalance = await decryptBalance(mbtc, signers.alice);
    const usdcBalance = await decryptBalance(musdc, signers.alice);

    expect(usdcBalance).to.equal(ethers.parseUnits("10000", 6) - swapAmount);
    expect(btcBalance).to.equal(swapAmount / 100000n);
  });

  it("returns encrypted balances through the swap helper", async function () {
    await mbtc.connect(signers.alice).faucet();
    const directBtc = await mbtc.confidentialBalanceOf(signers.alice.address);
    const directUsdc = await musdc.confidentialBalanceOf(signers.alice.address);

    const balances = await swap.getEncryptedBalances(signers.alice.address);

    expect(balances[0]).to.equal(directBtc);
    expect(balances[1]).to.equal(directUsdc);
    expect(await swap.getExchangeRate()).to.equal(100000);
  });
});
