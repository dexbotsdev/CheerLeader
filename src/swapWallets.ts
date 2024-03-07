
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { getMint } from "@solana/spl-token";
import { PublicKey, TransactionInstruction, SystemProgram, TransactionMessage, VersionedTransaction, Keypair } from "@solana/web3.js";
import BN from "bn.js";
import { Logger, TOKEN_PROGRAM_ID, MARKET_STATE_LAYOUT_V3, Liquidity, TokenAmount, simulateTransaction, Token, publicKey } from 'raydium-sdk-opt';
import { connection } from "../config";
import { DEFAULT_TOKEN, wallet, PROGRAMIDS, makeTxVersion, addLookupTableInfo } from "../utils/constants";
import { getWalletTokenAccount, ammCreatePool } from "../utils/raydiumUtil";
import { lookupTableProvider } from "./clients/LookupTableProvider";
import { MERKEL_ROOT, getRandomTipAccount } from "./clients/config";
import { searcherClient } from "./clients/jito";
import { readFile } from "fs";
import { Bundle as JitoBundle } from 'jito-ts/dist/sdk/block-engine/types.js';
import { getTokenBalance } from "../utils/send_transaction";

const logger = Logger.from('Liquidity')


async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
          //console.log(error);
          return;
        }
    
    let Info = JSON.parse(data);
    let myToken = new PublicKey(Info.baseMint.mint)
    let tokenInfo = await getMint(connection, myToken, 'finalized', TOKEN_PROGRAM_ID)

    const baseToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenInfo.address), tokenInfo.decimals, 'DBD', 'DBD') // USDC
    const quoteToken = DEFAULT_TOKEN.SOL // RAYx
    const targetMarketId = new PublicKey(Info.marketId)


     const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)


    const marketBufferInfo: any = await connection.getAccountInfo(targetMarketId)
    const { baseMint, quoteMint, baseLotSize, quoteLotSize, baseVault, quoteVault, bids, asks, eventQueue, requestQueue } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data)
    console.log(baseMint.toString(), quoteMint.toString(), baseLotSize.toString(), quoteLotSize.toString());
    let poolKeys: any = Liquidity.getAssociatedPoolKeys({
        version: 4,
        marketVersion: 3,
        baseMint,
        quoteMint,
        baseDecimals: tokenInfo.decimals,
        quoteDecimals: 9,
        marketId: targetMarketId,
        programId: PROGRAMIDS.AmmV4,
        marketProgramId: PROGRAMIDS.OPENBOOK_MARKET
    })
    poolKeys.marketBaseVault = baseVault;
    poolKeys.marketQuoteVault = quoteVault;
    poolKeys.marketBids = bids;
    poolKeys.marketAsks = asks;
    poolKeys.marketEventQueue = eventQueue;
    // console.log("Pool Keys:", poolKeys);
    const outputTokenAmount = new TokenAmount(baseToken, 1, false);
    const inTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, 0.01, false);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();



        // -------- step 2: create instructions by SDK function --------
        const txMainSwaps: any = await createWalletSwaps(Info.supplyWallets,poolKeys, baseToken, blockhash)

        const bundle :any= [];

        for (var tnx of txMainSwaps) {
            bundle.push(tnx)
        }
        const batchSize = 5;
        console.log('sending FINAL BUNDLE  in Batches  ')  
        processItemsInBatches(bundle, batchSize, swapBundleBatch); 
        // Function to process items in batches
        function processItemsInBatches(bundle: string | any[], batchSize: number, swapBundleBatch: { (bundle: any): void; (arg0: any): void; }) {
            for (let i = 0; i < bundle.length; i += batchSize) {
                const batch = bundle.slice(i, i + batchSize);
                swapBundleBatch(batch);
            }
        }

        function swapBundleBatch(bundle:any) {
            searcherClient
                .sendBundle(new JitoBundle(bundle, bundle.length))
                .then((bundleId) => {
                    logger.info(
                        `Bundle ${bundleId} sent, backrunning ${bs58.encode(
                            bundle[0].signatures[0]
                        )}`
                    );

                }).catch((error) => {

                    console.log(error, 'Error sending bundle');
                    if (error?.message?.includes(
                        'Bundle Dropped, no connected leader up soon'
                    )) {
                        console.log(
                            'Error sending bundle: Bundle Dropped, no connected leader up soon.'
                        );
                    } else {
                        console.log(error, 'Error sending bundle');
                    }

                });

            searcherClient.onBundleResult(
                (bundleResult: any) => {
                    const bundleId = bundleResult.bundleId;
                    const isAccepted = bundleResult.accepted;
                    const isRejected = bundleResult.rejected;
                    if (isAccepted) {
                        logger.info(
                            `Bundle ${bundleId} accepted in slot ${bundleResult?.accepted.slot}`
                        );

                    }
                    if (isRejected) {
                        logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);

                    }
                },
                (error) => {
                    console.log(error);
                    throw error;
                }
            );
        }
    })


}
 


start()



const createWalletSwaps = async (swapWallets:any,poolKeys: any, baseToken: Token, blockhash: string) => {

    const txsSigned: VersionedTransaction[] = [];


    for (var item of swapWallets) {


        const baseMint=baseToken.mint;
        const userWallet = Keypair.fromSecretKey(bs58.decode(item.privateKey));
        const swapperwallet = new NodeWallet(userWallet);
        const tokenAccountBalance :any = await  getTokenBalance(baseMint,userWallet);

        console.debug('Create Step 1 Swap ') 
        const createSwapInstructions: TransactionInstruction[] = [];

        const userwalletTokenAccounts = await getWalletTokenAccount(connection, swapperwallet.publicKey);
        const outputTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, 0.01*1e9);
        const inTokenAmount = new TokenAmount(baseToken, tokenAccountBalance?.toString());
        const { innerTransactions: swapTransactions } = await Liquidity.makeSwapInstructionSimple({
            connection,
            poolKeys,
            userKeys: {
                tokenAccounts: userwalletTokenAccounts,
                owner: swapperwallet.publicKey,
            },
            amountIn: inTokenAmount,
            amountOut: outputTokenAmount,
            fixedSide: 'in',
            makeTxVersion,
            lookupTableCache: addLookupTableInfo
        });
        console.debug('Create Step 2 makeSwapInstructionSimple ')

        for (const itemIx of swapTransactions) {
            createSwapInstructions.push(...itemIx.instructions);
        }
        const tipSwapIxn = SystemProgram.transfer({
            fromPubkey: swapperwallet.publicKey,
            toPubkey: getRandomTipAccount(),
            lamports: BigInt('1000'),
        });
       
        createSwapInstructions.push(tipSwapIxn);
        createSwapInstructions.push(SystemProgram.transfer({
            fromPubkey: swapperwallet.publicKey,
            toPubkey: MERKEL_ROOT,
            lamports: BigInt('1000'),
        }))

        console.debug('Create Step 3 makeSwapInstructionSimple ')

        const addressesSwapMain: PublicKey[] = [];
        createSwapInstructions.forEach((ixn) => {
            ixn.keys.forEach((key) => {
                addressesSwapMain.push(key.pubkey);
            });
        });
        const lookupTablesSwapMain = lookupTableProvider.computeIdealLookupTablesForAddresses(addressesSwapMain);
        console.debug('Create Step 4 makeSwapInstructionSimple ')

        const messageMainSwap = new TransactionMessage({
            payerKey: swapperwallet.publicKey,
            recentBlockhash: blockhash,
            instructions: createSwapInstructions,
        }).compileToV0Message(lookupTablesSwapMain);
        const txMainSwap = new VersionedTransaction(messageMainSwap);

        console.debug('Create Step 5 makeSwapInstructionSimple ')

        try {
            const serializedMsg = txMainSwap.serialize();
            if (serializedMsg.length > 1232) {
                console.log('tx too big');
                return null;
            }
            txMainSwap.sign([swapperwallet.payer]); 
 
            txsSigned.push(txMainSwap);

            const tx: any = txMainSwap;
 

        } catch (e) {
            console.debug(e, 'error signing txMain');
            return null;
        }

        console.debug('Final  ')


    }


    return txsSigned;
}
