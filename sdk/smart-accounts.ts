import { ConnectedWallet } from "@privy-io/react-auth";
import { createSmartAccountClient, ENTRYPOINT_ADDRESS_V06, ENTRYPOINT_ADDRESS_V07, walletClientToSmartAccountSigner } from "permissionless";
import { ENTRYPOINT_ADDRESS_V06_TYPE, ENTRYPOINT_ADDRESS_V07_TYPE } from "permissionless/_types/types";
import { signerToEcdsaKernelSmartAccount, signerToLightSmartAccount, signerToSafeSmartAccount, SmartAccountSigner } from "permissionless/accounts";
import { createPimlicoBundlerClient, createPimlicoPaymasterClient } from "permissionless/clients/pimlico";
import { Chain, createPublicClient, createWalletClient, custom, http } from "viem";

export type SmartAccountType = 'kernel' | 'light_account' | 'safe';

export const eoaToSigner = async (eoa: ConnectedWallet, chain: Chain): Promise<SmartAccountSigner<"custom", `0x${string}`>> => {
    await eoa.switchChain(chain.id);
    // Get an EIP1193 provider and viem WalletClient for the EOA
    const provider = await eoa.getEthereumProvider();
    const signerClient = createWalletClient({
        account: eoa.address as `0x${string}`,
        chain: chain,
        transport: custom(provider),
    });

    return walletClientToSmartAccountSigner(signerClient);

}

const publicClientForChain = (chain: Chain) => createPublicClient({
    chain: chain, 
    transport: http(),
});

const pimlicoPaymasterForEntrypoint = (entrypoint: ENTRYPOINT_ADDRESS_V06_TYPE | ENTRYPOINT_ADDRESS_V07_TYPE) => createPimlicoPaymasterClient({
    transport: http(process.env.NEXT_PUBLIC_PIMLICO_PAYMASTER_URL),
    entryPoint: entrypoint,
});

const pimlicoBundlerForEntrypoint = (entrypoint: ENTRYPOINT_ADDRESS_V06_TYPE | ENTRYPOINT_ADDRESS_V07_TYPE) => createPimlicoBundlerClient({
    transport: http(process.env.NEXT_PUBLIC_PIMLICO_PAYMASTER_URL),
    entryPoint: entrypoint,
});

export const signerToSmartAccount = async (signer: SmartAccountSigner<"custom", `0x${string}`>, smartAccountType: SmartAccountType, chain: Chain) => {
    const entrypoint = smartAccountType === 'light_account' ? ENTRYPOINT_ADDRESS_V06 : ENTRYPOINT_ADDRESS_V07;
    const paymaster = pimlicoPaymasterForEntrypoint(entrypoint);
    const bundler = pimlicoBundlerForEntrypoint(entrypoint);
    const publicClient = publicClientForChain(chain);
    switch (smartAccountType) {
        case 'kernel':
            const kernelAccount = await signerToEcdsaKernelSmartAccount(publicClient, {
                entryPoint: entrypoint,
                signer: signer,
                index: 0n,
            });

            return createSmartAccountClient({
                account: kernelAccount,
                entryPoint: entrypoint,
                chain: chain,
                bundlerTransport: http("https://api.pimlico.io/v2/sepolia/rpc?apikey=API_KEY"),
                middleware: {
                    sponsorUserOperation: paymaster.sponsorUserOperation, // optional
                    gasPrice: async () => (await bundler.getUserOperationGasPrice()).fast, // use pimlico bundler to get gas prices
                },
            });
        case 'light_account':
            const lightAccount = await signerToLightSmartAccount(
                publicClient, 
                {
                signer: signer,
                entryPoint: entrypoint,
                lightAccountVersion: "1.1.0",
            });

            return createSmartAccountClient({
                account: lightAccount,
                entryPoint: entrypoint,
                chain: chain,
                bundlerTransport: http("https://api.pimlico.io/v2/sepolia/rpc?apikey=API_KEY"),
                middleware: {
                    sponsorUserOperation: paymaster.sponsorUserOperation, 
                    gasPrice: async () => (await bundler.getUserOperationGasPrice()).fast, 
                },
            });
        case 'safe':
            const safeAccount = await signerToSafeSmartAccount(
                publicClient,
                {
                  signer: signer,
                  safeVersion: '1.4.1',
                  entryPoint: entrypoint
                }
              );
        
              return createSmartAccountClient({
                account: safeAccount,
                entryPoint: entrypoint,
                chain: chain, 
                bundlerTransport: http(process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL),
                middleware: {
                  sponsorUserOperation: paymaster.sponsorUserOperation, 
                  gasPrice: async () => (await bundler.getUserOperationGasPrice()).fast, 
                },
              });
        default:
            throw new Error('Invalid smart account type.');
    }
}