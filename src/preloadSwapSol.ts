import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { revokeFreezeAuthority, revokeMintAuthority } from "../utils/web3utils";
import { readFile, writeFile } from "fs";
import { connection,  sender, tokenInfo } from "../config";
import { TOKEN_PROGRAM_ID, getMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { Logger, Token } from "raydium-sdk-opt";
import bs58 from "bs58";
import { randomInt } from "crypto";
import { transferSPL } from "../utils/send_transaction";
import { wallet } from "../utils/constants";
import { Bundle as JitoBundle } from 'jito-ts/dist/sdk/block-engine/types.js';
import { searcherClient } from "./clients/jito";
import { MERKEL_ROOT, getRandomTipAccount } from "./clients/config";
import { lookupTableProvider } from "./clients/LookupTableProvider";

let baseMint: PublicKey;
const logger = Logger.from('CheerLeader')

async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
            //logger.debug(error);
            return;
        }
        const tokenInfoData = JSON.parse(data);
        const mint = new PublicKey(tokenInfoData.baseMint.mint);
        const mintInfo = await getMint(connection, mint);
 
        const pumpWallets = tokenInfoData.swapWallets;
 
        for (var pi = 0; pi < pumpWallets.length; pi += 8) {
            const createWalletInstructions: TransactionInstruction[] = [];

            
            for (var i = 0; i < 8; i++) {
            
                if(pumpWallets[pi + i])
            {    const walletAddress = pumpWallets[pi + i].walletAddress;
                 createWalletInstructions.push(
                    SystemProgram.transfer({
                        fromPubkey: sender.publicKey,
                        toPubkey: new PublicKey(walletAddress),
                        lamports: tokenInfo.amountToSwap * LAMPORTS_PER_SOL
                    }) 
                );
}
                

            }
            const tipIxnA = SystemProgram.transfer({
                fromPubkey: sender.publicKey,
                toPubkey: MERKEL_ROOT,
                lamports: 0.001 * LAMPORTS_PER_SOL
            });
            const tipIxnB = SystemProgram.transfer({
                fromPubkey: sender.publicKey,
                toPubkey: getRandomTipAccount(),
                lamports: BigInt('1000'),
            });
            createWalletInstructions.push(tipIxnA,tipIxnB);

            const addressesMain: PublicKey[] = [];
            createWalletInstructions.forEach((ixn) => {
                ixn.keys.forEach((key) => {
                    addressesMain.push(key.pubkey);
                });
            });
            const lookupTablesMain =
                lookupTableProvider.computeIdealLookupTablesForAddresses(addressesMain);
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

            const messageMain = new TransactionMessage({
                payerKey: sender.publicKey,
                recentBlockhash: blockhash,
                instructions: createWalletInstructions,
            }).compileToV0Message(lookupTablesMain);
            const txMain = new VersionedTransaction(messageMain);

            try {
                const serializedMsg = txMain.serialize();
                if (serializedMsg.length > 1232) {
                    console.log('tx too big');
                    process.exit(0);
                }
                txMain.sign([sender]);
            } catch (e) {
                console.log(e, 'error signing txMain');
                process.exit(0);
            }

            const bundle = [txMain];


            searcherClient
                .sendBundle(new JitoBundle(bundle, bundle.length))
                .then((bundleId) => {
                    logger.info(
                        `Bundle ${bundleId} sent, backrunning ${bs58.encode(
                            bundle[0].signatures[0],
                        )}`,
                    );

                }).catch((error) => {

                    console.log(error, 'Error sending bundle');
                    if (
                        error?.message?.includes(
                            'Bundle Dropped, no connected leader up soon',
                        )
                    ) {
                        console.log(
                            'Error sending bundle: Bundle Dropped, no connected leader up soon.',
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
                            `Bundle ${bundleId} accepted in slot ${bundleResult?.accepted.slot}`,
                        );

                    }
                    if (isRejected) {
                        logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);

                    }
                },
                (error) => {
                    console.log(error);
                    throw error;
                },
            );
        }
        tokenInfoData.supplyWallets = pumpWallets;

        writeFile('./tokenInfo.json', JSON.stringify(tokenInfoData), (err) => {
            if (err) throw err;
            console.log('The file has been saved! Now run --  npm run createPool');
        });


    })

}


start()