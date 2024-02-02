import { ExtensionType, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotent, createInitializeMintInstruction, createInitializeTransferFeeConfigInstruction, getAssociatedTokenAddress, getMintLen, getTransferFeeAmount, mintTo, unpackAccount, withdrawWithheldTokensFromAccounts } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { AccountsAmount } from "./types";
import { NFTStorage } from 'nft.storage';
import { METADATA_2022_PROGRAM_ID, METADATA_2022_PROGRAM_ID_TESTNET, SUPPORTED_CHAINS } from "./constants";
 
import { readFileSync } from 'fs';
import { File } from "nft.storage";
import { NFT_STORAGE_TOKEN } from "../config";
 


function validateAddress(address: string) {
    let isValid = false;
    // Check if the address is valid
    try {
        new PublicKey(address);
        isValid = true;
    } catch (error) {
        console.error('Invalid address:', error);
    }
    return isValid;
}

export async function initSolanaWeb3Connection(rpc: string): Promise<Connection> {
    let connection: Connection = new Connection(rpc, 'confirmed');
    try {
        connection = new Connection(rpc, 'confirmed');
    } catch (error) {
        console.error('Invalid address:', error);
    }
    return connection;
}
  

export async function uploadImageLogo(imagePath: string, name:string, symbol:string,description:string) {
    let imageUrl = ""


    try {
        const data :any= readFileSync(imagePath)

     
        const client = new NFTStorage({ token:NFT_STORAGE_TOKEN})
        const metadataInfo =  await client.store({
            name: name,
            symbol:symbol,
            description: description,
            image: new File(data, `${symbol}.jpeg`, { type: 'image/jpg' })
          })
         
        imageUrl = `https://${metadataInfo.ipnft}.ipfs.nftstorage.link/metadata.json`;
    } catch (ex) {
        console.log(ex)
    }
    return imageUrl
}

  
 
  
  