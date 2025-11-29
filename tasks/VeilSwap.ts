import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("swap:addresses", "Prints deployed VeilSwap + token addresses").setAction(async function (_args, hre) {
  const { deployments } = hre;
  const btc = await deployments.get("ERC7984Bitcoin");
  const usdc = await deployments.get("ERC7984USDC");
  const swap = await deployments.get("VeilSwap");

  console.log(`mBTC  : ${btc.address}`);
  console.log(`mUSDC : ${usdc.address}`);
  console.log(`VeilSwap: ${swap.address}`);
});

task("swap:set-operator", "Grants VeilSwap operator rights on tokens for swaps")
  .addOptionalParam("hours", "Validity in hours (default 720)", "720")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const swap = await deployments.get("VeilSwap");
    const btc = await deployments.get("ERC7984Bitcoin");
    const usdc = await deployments.get("ERC7984USDC");

    const [signer] = await ethers.getSigners();
    const until =
      BigInt(Math.floor(Date.now() / 1000)) + BigInt(Number(taskArguments.hours || "720") * 60 * 60);

    const btcContract = await ethers.getContractAt("ERC7984Bitcoin", btc.address, signer);
    const usdcContract = await ethers.getContractAt("ERC7984USDC", usdc.address, signer);

    let tx = await btcContract.setOperator(swap.address, until);
    await tx.wait();
    tx = await usdcContract.setOperator(swap.address, until);
    await tx.wait();
    console.log(`Granted operator rights to VeilSwap (${swap.address}) until ~${taskArguments.hours}h from now`);
  });

task("swap:btc", "Swap mBTC to mUSDC at the fixed rate")
  .addParam("value", "Amount of mBTC to swap (plaintext, decimals supported)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;
    const swapDeployment = await deployments.get("VeilSwap");
    const [signer] = await ethers.getSigners();
    await fhevm.initializeCLIApi();

    const amount = ethers.parseUnits(taskArguments.value, 6);
    const encrypted = await fhevm.createEncryptedInput(swapDeployment.address, signer.address).add64(amount).encrypt();

    const swap = await ethers.getContractAt("VeilSwap", swapDeployment.address, signer);
    const tx = await swap.swapMbtcForMusdc(encrypted.handles[0], encrypted.inputProof);
    await tx.wait();
    console.log(`Swapped ${taskArguments.value} mBTC for mUSDC`);
  });

task("swap:usdc", "Swap mUSDC to mBTC at the fixed rate")
  .addParam("value", "Amount of mUSDC to swap (plaintext, decimals supported)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;
    const swapDeployment = await deployments.get("VeilSwap");
    const [signer] = await ethers.getSigners();
    await fhevm.initializeCLIApi();

    const amount = ethers.parseUnits(taskArguments.value, 6);
    const encrypted = await fhevm.createEncryptedInput(swapDeployment.address, signer.address).add64(amount).encrypt();

    const swap = await ethers.getContractAt("VeilSwap", swapDeployment.address, signer);
    const tx = await swap.swapMusdcForMbtc(encrypted.handles[0], encrypted.inputProof);
    await tx.wait();
    console.log(`Swapped ${taskArguments.value} mUSDC for mBTC`);
  });

task("swap:seed", "Invoke VeilSwap faucet seeding helper")
  .addParam("btc", "Number of mBTC faucet calls", "1")
  .addParam("usdc", "Number of mUSDC faucet calls", "1")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const swapDeployment = await deployments.get("VeilSwap");
    const [signer] = await ethers.getSigners();

    const swap = await ethers.getContractAt("VeilSwap", swapDeployment.address, signer);
    const tx = await swap.seedLiquidity(
      Number(taskArguments.btc || "1"),
      Number(taskArguments.usdc || "1"),
    );
    await tx.wait();
    console.log(
      `Seeded liquidity (btc faucet calls: ${taskArguments.btc}, usdc faucet calls: ${taskArguments.usdc})`,
    );
  });
