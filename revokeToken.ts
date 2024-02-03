import { connection, privateKey, NFT_STORAGE_TOKEN, tokenInfo, RPC_URL } from "./config";
import { Connection, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Metaplex, keypairIdentity, toBigNumber, irysStorage, token } from "@metaplex-foundation/js";
import { METAPLEX, SOL, metadata, revokeFreezeAuthority, revokeMintAuthority, umi, uploadImage, userWallet, userWalletSigner } from "./src/web3utils";
import { CandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { generateSigner, percentAmount, signerIdentity } from "@metaplex-foundation/umi";
import { wallet } from "./src/constants";
import { TokenStandard, createAndMint, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createMint, mintTo } from '@solana/spl-token';
import { readFile, writeFile } from "fs";

let baseMint: PublicKey; 

async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
        //logger.debug(error);
          return;
        }
        const tokenInfo = JSON.parse(data);  
        baseMint = new PublicKey(tokenInfo.baseMint);

        const revokeMint = await revokeMintAuthority(baseMint);
        const revokeFreeze = await revokeFreezeAuthority(baseMint);

        if(revokeFreeze && revokeMint){
            console.log("Successfully Revoked , now run 'npm run createMarket' ")
        }

    })

}


start()