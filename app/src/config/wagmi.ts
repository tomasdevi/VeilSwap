import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'VeilSwap',
  projectId: 'VeilSwapPortal',
  chains: [sepolia],
  ssr: false,
});
