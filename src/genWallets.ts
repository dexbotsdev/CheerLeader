import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { revokeFreezeAuthority, revokeMintAuthority } from "../utils/web3utils";
import { readFile, writeFile } from "fs";
import { connection, privateKey } from '../config';
import { TOKEN_PROGRAM_ID, getMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { Logger, Token, TokenAmount } from 'raydium-sdk-opt';
import bs58 from "bs58";
import { randomInt } from "crypto";
import { transferSPL } from '../utils/send_transaction';
import { wallet } from "../utils/constants";
import { Bundle as JitoBundle } from 'jito-ts/dist/sdk/block-engine/types.js';
import { searcherClient } from "./clients/jito";
import { getRandomTipAccount } from "./clients/config";
import { lookupTableProvider } from "./clients/LookupTableProvider";

let baseMint: PublicKey;
const logger = Logger.from('CheerLeader')
const batchSize = 8;

async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
             return;
        }
        const tokenInfo = JSON.parse(data);
        const mint = new PublicKey(tokenInfo.baseMint.mint);
        const mintInfo = await getMint(connection, mint);
     
        tokenInfo.supplyWallets = [];
        tokenInfo.swapWallets = []; 
  
        for (var i = 0; i < tokenInfo.supplyWalletsCount; i++) {
            const tokenTransferAmnt = tokenInfo.walletAmountsFixed ? Number(tokenInfo.walletFixedTokens) * Number(tokenInfo.supply) * 0.01 ** mintInfo.decimals : randomInt(10000) * 1 ** mintInfo.decimals;
            const keypair = Keypair.generate();
            const walletAddress = keypair.publicKey.toBase58();
            const privateKey = bs58.encode(keypair.secretKey);
           
            tokenInfo.supplyWallets.push({
                walletAddress: walletAddress,
                privateKey: privateKey,
                tokenAmount: tokenTransferAmnt,
                solAmount : tokenInfo.fixedSolTransfer, 
            })

        }
        for (var i = 0; i < tokenInfo.swapWalletsCount; i++) {
            const keypair = Keypair.generate();
            const walletAddress = keypair.publicKey.toBase58();
            const privateKey = bs58.encode(keypair.secretKey);
           
            tokenInfo.swapWallets.push({
                walletAddress: walletAddress,
                privateKey: privateKey,
                tokenSwapAmount: randomInt(100)*1e5, 
            })

        }
       
        const swapWalletsTxt = tokenInfo.swapWallets.map((item: { privateKey: any; })=>item.privateKey)
        const supplyWalletsTxt = tokenInfo.supplyWallets.map((item: { privateKey: any; })=>item.privateKey)


        writeFile('./tokenInfo.json', JSON.stringify(tokenInfo), (err) => {
            if (err) throw err;
            console.log('The file tokenInfo been saved! Now run --  npm run preloadSol');
        });

        writeFile('./swapWallets.txt', JSON.stringify(swapWalletsTxt,null,2), (err) => {
            if (err) throw err;
            console.log('The file swapWallets been saved! Now run --  npm run preloadSol');
        });
        writeFile('./supplyWallets.txt', JSON.stringify(supplyWalletsTxt,null,2), (err) => {
            if (err) throw err;
            console.log('The file supplyWallets been saved! Now run --  npm run preloadSol');
        });
    })

}


start()