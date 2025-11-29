// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984Bitcoin} from "./ERC7984Bitcoin.sol";
import {ERC7984USDC} from "./ERC7984USDC.sol";

/// @title VeilSwap
/// @notice Minimal constant-rate swap between mBTC and mUSDC with encrypted amounts.
contract VeilSwap is Ownable, ZamaEthereumConfig {
    uint64 internal constant BTC_TO_USDC_RATE = 100000;
    ERC7984Bitcoin public immutable mbtc;
    ERC7984USDC public immutable musdc;

    event LiquiditySeeded(address indexed caller, uint256 btcCalls, uint256 usdcCalls);
    event Swapped(address indexed account, bool btcToUsdc, euint64 inputAmount, euint64 outputAmount);

    constructor(ERC7984Bitcoin mbtc_, ERC7984USDC musdc_) Ownable(msg.sender) {
        mbtc = mbtc_;
        musdc = musdc_;
    }

    /// @notice Swap encrypted mBTC for mUSDC using the fixed exchange rate.
    /// @param encryptedAmount encrypted amount of mBTC being swapped
    /// @param inputProof proof returned by the relayer
    function swapMbtcForMusdc(externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (euint64) {
        euint64 btcAmount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allow(btcAmount, address(this));
        FHE.allow(btcAmount, address(mbtc));

        euint64 transferred = mbtc.confidentialTransferFrom(msg.sender, address(this), btcAmount);
        euint64 musdcAmount = _btcToMusdc(transferred);
        FHE.allow(musdcAmount, address(this));
        FHE.allow(musdcAmount, address(musdc));

        euint64 sent = musdc.confidentialTransfer(msg.sender, musdcAmount);
        emit Swapped(msg.sender, true, transferred, sent);
        return sent;
    }

    /// @notice Swap encrypted mUSDC for mBTC using the fixed exchange rate.
    /// @param encryptedAmount encrypted amount of mUSDC being swapped
    /// @param inputProof proof returned by the relayer
    function swapMusdcForMbtc(externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (euint64) {
        euint64 musdcAmount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allow(musdcAmount, address(this));
        FHE.allow(musdcAmount, address(musdc));

        euint64 transferred = musdc.confidentialTransferFrom(msg.sender, address(this), musdcAmount);
        euint64 btcAmount = _musdcToBtc(transferred);
        FHE.allow(btcAmount, address(this));
        FHE.allow(btcAmount, address(mbtc));

        euint64 sent = mbtc.confidentialTransfer(msg.sender, btcAmount);
        emit Swapped(msg.sender, false, transferred, sent);
        return sent;
    }

    /// @notice Calls the faucets on both tokens so the pool keeps fresh liquidity.
    /// @dev Owner callable helper so UI can offer "top-up" action without exposing faucet logic.
    function seedLiquidity(uint8 btcCalls, uint8 usdcCalls) external onlyOwner {
        for (uint8 i = 0; i < btcCalls; i++) {
            mbtc.faucet();
        }
        for (uint8 j = 0; j < usdcCalls; j++) {
            musdc.faucet();
        }
        emit LiquiditySeeded(msg.sender, btcCalls, usdcCalls);
    }

    /// @notice Returns the encrypted balances for any wallet.
    function getEncryptedBalances(address account) external view returns (euint64 btcBalance, euint64 usdcBalance) {
        btcBalance = mbtc.confidentialBalanceOf(account);
        usdcBalance = musdc.confidentialBalanceOf(account);
    }

    /// @notice Returns the fixed price (1 mBTC = 100000 mUSDC).
    function getExchangeRate() external pure returns (uint64) {
        return BTC_TO_USDC_RATE;
    }

    function _btcToMusdc(euint64 amount) internal returns (euint64) {
        euint64 rate = FHE.asEuint64(BTC_TO_USDC_RATE);
        return FHE.mul(amount, rate);
    }

    function _musdcToBtc(euint64 amount) internal returns (euint64) {
        return FHE.div(amount, BTC_TO_USDC_RATE);
    }
}
