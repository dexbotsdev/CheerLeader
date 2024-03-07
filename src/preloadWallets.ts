import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { revokeFreezeAuthority, revokeMintAuthority } from "../utils/web3utils";
import { readFile, writeFile } from "fs";
import { connection, sender, tokenInfo } from "../config";
import { TOKEN_PROGRAM_ID, getMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { Logger, Token } from "raydium-sdk-opt";
import bs58 from "bs58";
import { randomInt } from "crypto";
import { sendTx, transferSPL } from "../utils/send_transaction";
import { wallet } from "../utils/constants";
import { Bundle as JitoBundle } from 'jito-ts/dist/sdk/block-engine/types.js';
import { searcherClient } from "./clients/jito";
import { MERKEL_ROOT, getRandomTipAccount } from "./clients/config";
import { lookupTableProvider } from "./clients/LookupTableProvider";
import { buildAndSendTx } from "../utils/raydiumUtil";

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
        const baseToken = new Token(TOKEN_PROGRAM_ID, mint, mintInfo.decimals);
        const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");
        const fromTokenAccount = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, mint, wallet.publicKey);

        const senderAmount = Number(tokenInfo.senderShare) * 0.01 * Number(tokenInfo.supply) 
        const txnInst: any = await transferSPL(tokenInfoData.baseMint.mint, senderAmount.toString(), sender.publicKey.toBase58(), wallet.payer, fromTokenAccount);


        const tnx = new Transaction().add(txnInst);
        await sendTx(connection, tnx,[wallet.payer])

        new Promise((resolve)=>setTimeout(resolve,5000));

        const fromSenderTokenAccount = await getOrCreateAssociatedTokenAccount(connection, sender, mint, sender.publicKey);

        const pumpWallets = tokenInfoData.supplyWallets;
        for (var pi = 0; pi < pumpWallets.length; pi += 8) {
            const createWalletInstructions: TransactionInstruction[] = [];

            for (var i = 0; i < 8; i++) {
            if(pumpWallets[pi + i])    
            {
                const tokenTransferAmnt = tokenInfoData.walletAmountsFixed ? Number(pumpWallets[pi + i].tokenSwapAmount) : randomInt(10000) ;
                const walletAddress = pumpWallets[pi + i].walletAddress;
                const txnInst: any = await transferSPL(tokenInfoData.baseMint.mint, tokenTransferAmnt.toFixed(0), walletAddress, sender, fromTokenAccount);
                createWalletInstructions.push(
                    txnInst
                );

 
            }}
            const tipIxn = SystemProgram.transfer({
                fromPubkey: sender.publicKey,
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
        tokenInfoData.supplyWallets = pumpWallets;

        writeFile('./tokenInfo.json', JSON.stringify(tokenInfoData), (err) => {
            if (err) throw err;
            console.log('The file has been saved! Now run --  npm run createPool');
        });


    })

}


start()