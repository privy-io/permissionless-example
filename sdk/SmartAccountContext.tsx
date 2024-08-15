import React, { useState, useEffect, useContext, useCallback } from "react";
import { ConnectedWallet, useLinkWithSiwe, usePrivy, useWallets, WalletWithMetadata } from "@privy-io/react-auth";
import { Chain, Transport } from "viem";
import { SmartAccount } from "permissionless/accounts";
import {
  type SmartAccountClient,
} from "permissionless";
import { EntryPoint } from "permissionless/types";
import { eoaToSigner, signerToSmartAccount, SmartAccountType } from "./smart-accounts";

/** Interface returned by custom `useSmartAccount` hook */
interface SmartAccountInterface {
  /** Privy embedded wallet, used as a signer for the smart account */
  eoa: ConnectedWallet | undefined;
  /** Smart account client to send signature/transaction requests to the smart account */
  smartAccountClient:
    | SmartAccountClient<EntryPoint, Transport, Chain, SmartAccount<EntryPoint, string, Transport, Chain>>
    | Transport
    | any
    | SmartAccount<EntryPoint, string, Transport, Chain>
    | null;
  /** Smart account address */
  smartAccountAddress: `0x${string}` | undefined;
  /** Boolean to indicate whether the smart account state has initialized */
  smartAccountReady: boolean;
}

const SmartAccountContext = React.createContext<SmartAccountInterface>({
  eoa: undefined,
  smartAccountClient: undefined,
  smartAccountAddress: undefined,
  smartAccountReady: false,
});

export const useSmartAccount = () => {
  return useContext(SmartAccountContext);
};

export const SmartAccountProvider = ({
  children,
  chain,
  smartAccountType
}: {
  children: React.ReactNode;
  chain: Chain;
  smartAccountType: SmartAccountType;
}) => {
  const {wallets} = useWallets();
  const eoa = wallets.find((wallet) => wallet.walletClientType === "privy");
  const {user} = usePrivy();
  const {generateSiweMessage, linkWithSiwe} = useLinkWithSiwe();
  const linkedSmartAccount = user?.linkedAccounts.find((account): account is WalletWithMetadata => (account.type === 'wallet' && account.walletClientType === 'privy_smart_account'));

  // States to store the smart account and its status
  const [smartAccountClient, setSmartAccountClient] = useState<
    | SmartAccountClient<EntryPoint, Transport, Chain, SmartAccount<EntryPoint, string, Transport, Chain>>
    | Transport
    | any
    | SmartAccount<EntryPoint, string, Transport, Chain>
    | null
  >();
  const [smartAccountAddress, setSmartAccountAddress] = useState<
    `0x${string}` | undefined
  >();
  const [smartAccountReady, setSmartAccountReady] = useState(false);

  const linkSmartAccount = useCallback(async () => {
    if (!smartAccountClient) return;
    const chainId = `eip155:${chain.id}`
    const message = await generateSiweMessage({
      address: smartAccountClient.account.address, 
      chainId
    })
    const signature = await smartAccountClient.signMessage({message});
    await linkWithSiwe({signature, message, chainId});
  }, [smartAccountClient, chain]);

  useEffect(() => {
    const createSmartWallet = async (eoa: ConnectedWallet) => {
      const signer = await eoaToSigner(eoa, chain);
      const smartAccountClient = await signerToSmartAccount(signer, smartAccountType, chain);
      const smartAccountAddress = smartAccountClient.account?.address;

      // TODO: Link smart account to user if not already linked
      setSmartAccountClient(smartAccountClient);
      setSmartAccountAddress(smartAccountAddress);
      setSmartAccountReady(true);
    };

    if (eoa) createSmartWallet(eoa);
  }, [eoa?.address]);

  useEffect(() => {
    if (!smartAccountReady) return;
    // If smart account is already linked, do not link it again
    if (linkedSmartAccount?.address === smartAccountAddress) return;
    // Otherwise link the smart account
    linkSmartAccount();
  }, [smartAccountAddress, smartAccountReady, linkedSmartAccount?.address]);

  return (
    <SmartAccountContext.Provider
      value={{
        smartAccountReady: smartAccountReady,
        smartAccountClient: smartAccountClient,
        smartAccountAddress: smartAccountAddress,
        eoa: eoa,
      }}
    >
      {children}
    </SmartAccountContext.Provider>
  );
};
