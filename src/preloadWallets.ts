import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { revokeFreezeAuthority, revokeMintAuthority } from "../utils/web3utils";
import { readFile, writeFile } from "fs";
import { connection } from "../config";
import { TOKEN_PROGRAM_ID, getMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { Logger, Token } from "raydium-sdk-opt";
import bs58 from "bs58";
import { randomInt } from "crypto";
import { transferSPL } from "../utils/send_transaction";
import { wallet } from "../utils/constants";
import { Bundle as JitoBundle } from 'jito-ts/dist/sdk/block-engine/types.js';
import { searcherClient } from "./clients/jito";
import { getRandomTipAccount } from "./clients/config";
import { lookupTableProvider } from "./clients/LookupTableProvider";

let baseMint: PublicKey;
const logger = Logger.from('CheerLeader')

async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
            //logger.debug(error);
            return;
        }
        const tokenInfo = JSON.parse(data);
        const mint = new PublicKey(tokenInfo.baseMint.mint);
        const mintInfo = await getMint(connection, mint);
        const baseToken = new Token(TOKEN_PROGRAM_ID, mint, mintInfo.decimals);
        const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");
        const fromTokenAccount = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, mint, wallet.publicKey);


        const pumpWallets = tokenInfo.supplyWallets;
        for (var pi = 0; pi < pumpWallets.length; pi += 8) {
            const createWalletInstructions: TransactionInstruction[] = [];

            for (var i = 0; i < 8; i++) {
                const tokenTransferAmnt = tokenInfo.walletAmountsFixed ? Number(tokenInfo.walletFixedTokens) * Number(tokenInfo.supply) * 0.01 ** mintInfo.decimals : randomInt(10000) * 1 ** mintInfo.decimals;
                const walletAddress = pumpWallets[pi + i].walletAddress;
                const txnInst: any = await transferSPL(tokenInfo.baseMint.mint, tokenTransferAmnt.toFixed(0), walletAddress, wallet.payer, fromTokenAccount);
                createWalletInstructions.push(
                    SystemProgram.transfer({
                        fromPubkey: wallet.publicKey,
                        toPubkey: new PublicKey(walletAddress),
                        lamports: BigInt(tokenInfo.fixedSolTransfer * 1e9),
                    }),
                    txnInst
                );

 
            }

            const tipIxn = SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: getRandomTipAccount(),
                lamports: BigInt('1000'),
            });
            createWalletInstructions.push(tipIxn);

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
                payerKey: wallet.publicKey,
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
                txMain.sign([wallet.payer]);
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
        tokenInfo.supplyWallets = pumpWallets;

        writeFile('./tokenInfo.json', JSON.stringify(tokenInfo), (err) => {
            if (err) throw err;
            console.log('The file has been saved! Now run --  npm run createPool');
        });


    })

}


start()