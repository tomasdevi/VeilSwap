import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { ethers } from 'ethers';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { MBTC_CONTRACT, MUSDC_CONTRACT, VEIL_SWAP_CONTRACT } from '../config/contracts';
import '../styles/SwapApp.css';

type Token = 'BTC' | 'USDC';

const TOKEN_METADATA: Record<Token, { label: string; description: string }> = {
  BTC: { label: 'mBTC', description: 'Encrypted wrapped bitcoin' },
  USDC: { label: 'mUSDC', description: 'Encrypted stablecoin' },
};

const DECIMALS = 6;

export function SwapApp() {
  const { address } = useAccount();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();
  const signer = useEthersSigner();

  const [direction, setDirection] = useState<Token>('BTC');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const [pendingFaucet, setPendingFaucet] = useState<Token | null>(null);
  const [decrypting, setDecrypting] = useState<Token | null>(null);
  const [decryptedBalances, setDecryptedBalances] = useState<Record<Token, string | undefined>>({
    BTC: undefined,
    USDC: undefined,
  });

  const { data: encryptedBtc, refetch: refetchBtc, isFetching: fetchingBtc } = useReadContract({
    address: MBTC_CONTRACT.address,
    abi: MBTC_CONTRACT.abi,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: encryptedUsdc, refetch: refetchUsdc, isFetching: fetchingUsdc } = useReadContract({
    address: MUSDC_CONTRACT.address,
    abi: MUSDC_CONTRACT.abi,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: rateData } = useReadContract({
    address: VEIL_SWAP_CONTRACT.address,
    abi: VEIL_SWAP_CONTRACT.abi,
    functionName: 'getExchangeRate',
  });

  const rate = rateData ? BigInt(rateData as bigint) : 100000n;

  const parsedAmount = useMemo(() => {
    try {
      return amount ? parseUnits(amount, DECIMALS) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  const quote = direction === 'BTC' ? parsedAmount * rate : (parsedAmount / rate);
  const formattedQuote = formatUnits(quote, DECIMALS);

  const handleSwap = async () => {
    if (!address || !instance) {
      setStatus('Connect your wallet and wait for the encryption service.');
      return;
    }
    if (!signer) {
      setStatus('Signer unavailable. Please reconnect your wallet.');
      return;
    }
    if (parsedAmount <= 0n) {
      setStatus('Enter a positive amount.');
      return;
    }

    setIsSwapping(true);
    setStatus(null);
    try {
      const encryptedInput = await instance
        .createEncryptedInput(VEIL_SWAP_CONTRACT.address, address)
        .add64(parsedAmount)
        .encrypt();

      const resolvedSigner = await signer;
      const swapContract = new ethers.Contract(
        VEIL_SWAP_CONTRACT.address,
        VEIL_SWAP_CONTRACT.abi,
        resolvedSigner
      );

      const tx =
        direction === 'BTC'
          ? await swapContract.swapMbtcForMusdc(encryptedInput.handles[0], encryptedInput.inputProof)
          : await swapContract.swapMusdcForMbtc(encryptedInput.handles[0], encryptedInput.inputProof);

      await tx.wait();
      await Promise.all([refetchBtc(), refetchUsdc()]);
      setAmount('');
      setDecryptedBalances({ BTC: undefined, USDC: undefined });
      setStatus('Swap confirmed on-chain.');
    } catch (error) {
      console.error('Swap failed:', error);
      setStatus(error instanceof Error ? error.message : 'Swap failed.');
    } finally {
      setIsSwapping(false);
    }
  };

  const handleOperator = async () => {
    if (!address || !signer) {
      setStatus('Connect your wallet first.');
      return;
    }

    setIsGranting(true);
    setStatus(null);
    try {
      const resolvedSigner = await signer;
      const expiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
      const btcContract = new ethers.Contract(MBTC_CONTRACT.address, MBTC_CONTRACT.abi, resolvedSigner);
      const usdcContract = new ethers.Contract(MUSDC_CONTRACT.address, MUSDC_CONTRACT.abi, resolvedSigner);

      const tx1 = await btcContract.setOperator(VEIL_SWAP_CONTRACT.address, expiry);
      await tx1.wait();
      const tx2 = await usdcContract.setOperator(VEIL_SWAP_CONTRACT.address, expiry);
      await tx2.wait();

      setStatus('VeilSwap can now spend your encrypted tokens.');
    } catch (error) {
      console.error('Operator grant failed:', error);
      setStatus(error instanceof Error ? error.message : 'Failed to set operator access.');
    } finally {
      setIsGranting(false);
    }
  };

  const handleFaucet = async (token: Token) => {
    if (!signer) {
      setStatus('Connect your wallet first.');
      return;
    }
    setPendingFaucet(token);
    setStatus(null);
    try {
      const resolvedSigner = await signer;
      const target = token === 'BTC' ? MBTC_CONTRACT : MUSDC_CONTRACT;
      const contract = new ethers.Contract(target.address, target.abi, resolvedSigner);
      const tx = await contract.faucet();
      await tx.wait();
      await (token === 'BTC' ? refetchBtc() : refetchUsdc());
      setStatus(`${TOKEN_METADATA[token].label} faucet minted encrypted tokens.`);
    } catch (error) {
      console.error('Faucet failed:', error);
      setStatus(error instanceof Error ? error.message : 'Faucet transaction failed.');
    } finally {
      setPendingFaucet(null);
    }
  };

  const decryptBalance = async (token: Token) => {
    if (!instance || !signer || !address) {
      setStatus('Connect wallet and wait for the encryption service.');
      return;
    }

    const handle = token === 'BTC' ? (encryptedBtc as string | undefined) : (encryptedUsdc as string | undefined);
    if (!handle) {
      setStatus('No encrypted balance to decrypt yet.');
      return;
    }

    setDecrypting(token);
    setStatus(null);
    try {
      const keypair = instance.generateKeypair();
      const contractAddress = token === 'BTC' ? MBTC_CONTRACT.address : MUSDC_CONTRACT.address;
      const handleContractPairs = [{ handle, contractAddress }];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [contractAddress];
      const resolvedSigner = await signer;
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signature = await resolvedSigner.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );
      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays
      );
      const rawValue = result[handle] || '0';
      const readable = formatUnits(BigInt(rawValue), DECIMALS);
      setDecryptedBalances((prev) => ({ ...prev, [token]: readable }));
    } catch (error) {
      console.error('Decryption failed:', error);
      setStatus(error instanceof Error ? error.message : 'Failed to decrypt balance.');
    } finally {
      setDecrypting(null);
    }
  };

  const swapDisabled = isSwapping || !address || parsedAmount <= 0n || zamaLoading || !instance;

  return (
    <main className="swap-shell">
      <section className="panels">
        <article className="panel balances-panel">
          <header>
            <h2>Your Vault</h2>
            <p>Encrypted balances fetched directly from the FHE-powered ERC-7984 tokens.</p>
          </header>
          {!address && <p className="muted">Connect your wallet to view balances.</p>}
          <div className="balance-grid">
            {(['BTC', 'USDC'] as Token[]).map((token) => {
              const encryptedValue = token === 'BTC' ? encryptedBtc : encryptedUsdc;
              const isLoading = token === 'BTC' ? fetchingBtc : fetchingUsdc;
              return (
                <div key={token} className="balance-card">
                  <div className="token-label">
                    <span>{TOKEN_METADATA[token].label}</span>
                    <p>{TOKEN_METADATA[token].description}</p>
                  </div>
                  <p className="encrypted-handle">
                    {address ? (isLoading ? 'Loading...' : (encryptedValue as string | undefined) ?? '0x0') : '—'}
                  </p>
                  <div className="balance-actions">
                    <button
                      className="ghost"
                      onClick={() => decryptBalance(token)}
                      disabled={!address || decrypting === token}
                    >
                      {decrypting === token ? 'Decrypting…' : 'Decrypt balance'}
                    </button>
                    <button
                      className="ghost"
                      onClick={() => handleFaucet(token)}
                      disabled={!address || pendingFaucet === token}
                    >
                      {pendingFaucet === token ? 'Minting…' : 'Get faucet'}
                    </button>
                  </div>
                  {decryptedBalances[token] && (
                    <p className="clear-balance">{decryptedBalances[token]} {TOKEN_METADATA[token].label}</p>
                  )}
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel swap-panel">
          <header>
            <h2>Confidential Swap</h2>
            <p>Rate: 1 mBTC = {rate.toString()} mUSDC</p>
          </header>
          {zamaError && <p className="error">Encryption service error: {zamaError}</p>}
          <div className="direction-toggle">
            <button
              className={direction === 'BTC' ? 'active' : ''}
              onClick={() => setDirection('BTC')}
            >
              mBTC → mUSDC
            </button>
            <button
              className={direction === 'USDC' ? 'active' : ''}
              onClick={() => setDirection('USDC')}
            >
              mUSDC → mBTC
            </button>
          </div>

          <label className="field-label">Amount</label>
          <input
            className="swap-input"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            min="0"
            step="0.000001"
          />

          <div className="quote">
            <span>Est. you receive</span>
            <strong>
              {formattedQuote} {direction === 'BTC' ? TOKEN_METADATA.USDC.label : TOKEN_METADATA.BTC.label}
            </strong>
          </div>

          <button className="primary" onClick={handleSwap} disabled={swapDisabled}>
            {isSwapping ? 'Swapping…' : 'Execute swap'}
          </button>

          <button className="secondary" onClick={handleOperator} disabled={!address || isGranting}>
            {isGranting ? 'Granting access…' : 'Grant VeilSwap operator rights'}
          </button>

          {status && <p className="status-text">{status}</p>}
        </article>
      </section>
    </main>
  );
}
