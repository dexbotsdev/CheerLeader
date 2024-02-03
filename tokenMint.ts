import { connection, privateKey, NFT_STORAGE_TOKEN, tokenInfo, RPC_URL } from "./config";
import { Connection, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Metaplex, keypairIdentity, toBigNumber, irysStorage, token } from "@metaplex-foundation/js";
import { METAPLEX, SOL, metadata, revokeFreezeAuthority, revokeMintAuthority, umi, uploadImage, userWallet, userWalletSigner } from "./src/web3utils";
import { CandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { generateSigner, percentAmount, signerIdentity } from "@metaplex-foundation/umi";
import { wallet } from "./src/constants";
import { TokenStandard, createAndMint, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createMint, mintTo } from '@solana/spl-token';
import { writeFile } from "fs";

let baseMint: PublicKey;
let baseMintDecimals: number; 
let quoteMint: PublicKey;
let quoteMintDecimals: number;
const vaultInstructions: TransactionInstruction[] = [];
const vaultSigners: Keypair[] = []; 
const marketInstructions: TransactionInstruction[] = [];
const marketSigners: Keypair[] = []; 

async function main() {
    console.log(`Minting  token for ${tokenInfo.tokenName}`);
    const imgUri = await uploadImage(tokenInfo.image); 
    metadata.uri=imgUri;
    const mint = generateSigner(umi);
    umi.use(signerIdentity(userWalletSigner));
    umi.use(mplTokenMetadata())
    console.log(`Uploading Metadata for ${tokenInfo.tokenName}`);
    const { uri } = await METAPLEX
    .nfts()
    .uploadMetadata({
        name: metadata.name,
        symbol:metadata.symbol,
        description: metadata.description,
        image: imgUri,
        telegram:`https://t.me/${metadata.symbol}_portal` ,
        twitter:`https://x.com/${metadata.symbol}_guild` 
    });
    console.log('   Metadata URI:',uri);
 

 await createAndMint(umi, {
        mint,
        authority: umi.identity,
        name: metadata.name,
        symbol: metadata.symbol,
        uri: uri,
        isMutable:false,
        sellerFeeBasisPoints: percentAmount(0),
        decimals: tokenInfo.decimals,
        amount: Number(tokenInfo.supply)* 10**tokenInfo.decimals,
        tokenOwner: userWallet.publicKey,
        tokenStandard: TokenStandard.Fungible,
        }).sendAndConfirm(umi).then(async () => {
            console.log(`\nSuccessfully minted ${tokenInfo.supply} ${tokenInfo.symbol}\nToken Address: ${mint.publicKey}\n`); 
            baseMint = new PublicKey(mint.publicKey);
            baseMintDecimals = tokenInfo.decimals;
            quoteMint = new PublicKey(SOL);
            quoteMintDecimals = 9;

            writeFile('./tokenInfo.json',JSON.stringify({
                baseMint: mint.publicKey,
                quoteMint: SOL,
                ...tokenInfo
            }), (err) => {
                if (err) throw err;
                console.log('The file has been saved!');
              });
              console.log('Token has been Generated Now Run , "npm run revokeToken"')
            
             
        })


     
}

main();

