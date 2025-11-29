import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;

  const bitcoin = await deploy("ERC7984Bitcoin", {
    from: deployer,
    log: true,
  });

  const usdc = await deploy("ERC7984USDC", {
    from: deployer,
    log: true,
  });

  const swap = await deploy("VeilSwap", {
    from: deployer,
    args: [bitcoin.address, usdc.address],
    log: true,
  });

  log(`VeilSwap contract deployed to ${swap.address}`);

  log("Deploy finished. Call `npx hardhat swap:seed --btc 5 --usdc 5` on the target network to pre-fill liquidity.");
};
export default func;
func.id = "deploy_veilSwap"; // id required to prevent reexecution
func.tags = ["VeilSwap"];
