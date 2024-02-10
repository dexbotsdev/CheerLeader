import { TOKEN_PROGRAM_ID, createMint } from "@solana/spl-token";
import { PublicKey, Keypair } from "@solana/web3.js";
import { wallet } from "./src/constants";
import { connection } from "./config";
import { createAndMint } from "@metaplex-foundation/mpl-token-metadata";

export const createNewToken = async (
    feePayer: Keypair,
    mintAuthority: string,
    freezeAuthority: string,
    decimals: number,
    connection: any
) => {

    const token = await  createMint(
        connection,
        feePayer,
        new PublicKey(mintAuthority),
        freezeAuthority ? new PublicKey(freezeAuthority) : null,
        decimals,
     );
    console.log(token.toBase58());

    
};


createNewToken(wallet.payer,wallet.publicKey.toBase58(),'',6,connection);