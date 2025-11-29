// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "confidential-contracts-v91/contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";

contract ERC7984USDC is ERC7984, ZamaEthereumConfig {
    constructor() ERC7984("mUSDC", "mUSDC", "") {}

    function faucet() public {
        euint64 encryptedAmount = FHE.asEuint64(10000*1000000);
        _mint(msg.sender, encryptedAmount);
    }
}
