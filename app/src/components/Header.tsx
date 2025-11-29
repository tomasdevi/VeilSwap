import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">FHE POWERED</p>
        <h1>VeilSwap</h1>
        <p className="subtitle">Swap mBTC and mUSDC with encrypted balances and zero data leakage.</p>
      </div>
      <ConnectButton showBalance={false} chainStatus="icon" />
    </header>
  );
}
