import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata, createV1, TokenStandard, mintV1, createAndMint } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity, generateSigner, percentAmount, signerIdentity, signerPayer, createSignerFromKeypair } from "@metaplex-foundation/umi";
import * as readline from "readline"
import * as util from "util"
import * as process from "process"
import { connection, privateKey, tokenInfo } from '../config';
import { uploadImageLogo } from "./web3utils";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, Signer, Connection } from '@solana/web3.js';
import { OPENBOOK_DEX, OPENBOOK_DEX_DEVNET, SERUM_DEX_V3_DEVNET, TransactionWithSigners } from './constants';
import { getVaultOwnerAndNonce } from "./serum";
import { ACCOUNT_SIZE, TOKEN_PROGRAM_ID, createInitializeAccountInstruction } from "@solana/spl-token";
import { DexInstructions, Market } from "@project-serum/serum";
 import { sendSignedTransaction, signTransactions } from "./utils";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { web3 ,BN } from "@project-serum/anchor";
import { 
    sendAndConfirmTransaction, 
} from "@solana/web3.js";
import * as splToken from "@solana/spl-token";


const totalEventQueueSize = 128
const totalRequestQueueSize = 10
const totalOrderbookSize = 201
const TRANSACTION_MESSAGES = [
    {
        sendingMessage: "Creating mints.",
        successMessage: "Created mints successfully.",
    },
    {
        sendingMessage: "Creating vaults.",
        successMessage: "Created vaults successfully.",
    },
    {
        sendingMessage: "Creating market.",
        successMessage: "Created market successfully.",
    },
];
const programID = new PublicKey(OPENBOOK_DEX_DEVNET);

const SOL = 'So11111111111111111111111111111111111111112';

const umi = createUmi('https://api.devnet.solana.com');

const keypair = umi.eddsa.createKeypairFromSecretKey(privateKey.secretKey);

const wallet = new NodeWallet(privateKey);



umi.use(keypairIdentity(keypair)).use(mplTokenMetadata())

 
interface Metadata {
    tokenName: string;
    symbol: string;
    uri: string;
    tokenSupply: string;
    description: string
}
const metadata: Metadata = {
    tokenName: tokenInfo.tokenName,
    symbol: tokenInfo.symbol,
    uri: null!,
    tokenSupply: tokenInfo.supply,
    description: tokenInfo.description + ` \n Telegram : https://t.me/${tokenInfo.symbol}_portal`
};
interface CreateMarketInfo {
    baseToken: PublicKey;
    quoteToken: PublicKey;
    baseLotSize: number;
    quoteLotSize: number;
    feeRateBps: number;
}

const mint = generateSigner(umi);

async function createMyToken() {
    await createAndMint(umi, {
        mint,
        authority: umi.identity,
        name: metadata.tokenName,
        symbol: metadata.symbol,
        uri: metadata.uri,
        sellerFeeBasisPoints: percentAmount(0),
        decimals: 9,
        amount: Number(tokenInfo.supply),
        tokenOwner: umi.identity.publicKey,
        tokenStandard: TokenStandard.Fungible,
    }).sendAndConfirm(umi).then(async () => {
        console.log(`\nSuccessfully minted ${tokenInfo.supply} ${tokenInfo.symbol}\nToken Address: ${mint.publicKey}\n`);

        let baseMint: PublicKey;
        let baseMintDecimals: number;

        let quoteMint: PublicKey;
        let quoteMintDecimals: number; 

        baseMint = new PublicKey(mint.publicKey);
        baseMintDecimals = tokenInfo.decimals;
        quoteMint = new PublicKey(SOL);
        quoteMintDecimals = 9;
        const dex_id = new PublicKey(OPENBOOK_DEX_DEVNET);


        const ethMarket = await createMarket(
            connection,
            privateKey,
            dex_id,
            {
                baseToken: baseMint,
                quoteToken: quoteMint,
                baseLotSize: 1000000,
                quoteLotSize: 1,
                feeRateBps: 0,
            }, 1048588);
    
        //console.log(solMarket.address.toString);
        console.log(ethMarket.address.toString);
 
    })

}
async function createAccount(conn: Connection, owner: Keypair, pid: PublicKey, space: number): Promise<Keypair> {
    const newAccount = new Keypair();
    const createTx = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: owner.publicKey,
            newAccountPubkey: newAccount.publicKey,
            programId: pid,
            lamports: await conn.getMinimumBalanceForRentExemption(
                space
            ),
            space,
        })
    );

    await sendAndConfirmTransaction(conn, createTx, [
        owner,
        newAccount,
    ]);
    return newAccount;
}

async function createMarket(conn: Connection, authority: Keypair, dexProgramId: PublicKey, info: CreateMarketInfo, eventQSize : number ): Promise<Market> {
    const owner = authority;
    const market = await createAccount(conn, owner, dexProgramId, Market.getLayout(dexProgramId).span);
    console.log('market : ' + market.publicKey.toString());
    const requestQueue = await createAccount(conn, owner, dexProgramId, 10);
    console.log('requestQueue : ' + requestQueue.publicKey.toString());
    const eventQueue = await createAccount(conn, owner, dexProgramId, 129);
    console.log('eventQueue : ' + eventQueue.publicKey.toString());
    const bids = await createAccount(conn, owner, dexProgramId, 201);
    console.log('bids : ' + bids.publicKey.toString());
    const asks = await createAccount(conn, owner, dexProgramId, 201);
    console.log('asks : ' + asks.publicKey.toString());
    const quoteDustThreshold = new BN(10);

    const [vaultOwner, vaultOwnerBump] = await findVaultOwner(market.publicKey, dexProgramId,);

    const [baseVault, quoteVault] = await Promise.all([
        splToken.createAccount(conn, authority, info.baseToken, vaultOwner, Keypair.generate()),
        splToken.createAccount(conn, authority, info.quoteToken, vaultOwner, Keypair.generate()),
    ]);

    console.log('vaultOwner : ' + vaultOwner.toString());
    console.log('baseVault : ' + baseVault.toString());
    console.log('quoteVault : ' + quoteVault.toString());

    const initMarketTx = new Transaction( {
        feePayer: authority.publicKey,
        recentBlockhash: (await conn.getRecentBlockhash()).blockhash,
    }
    ).add(
        DexInstructions.initializeMarket(
            toPublicKeys({
                market,
                requestQueue,
                eventQueue,
                bids,
                asks,
                baseVault,
                quoteVault,
                baseMint: info.baseToken,
                quoteMint: info.quoteToken,
                baseLotSize: new BN(info.baseLotSize),
                quoteLotSize: new BN(info.quoteLotSize),
                feeRateBps: info.feeRateBps,
                vaultSignerNonce: vaultOwnerBump,
                quoteDustThreshold,
                programId: dexProgramId,
            })
        )
    );

    const tnx = await  sendAndConfirmTransaction(conn, initMarketTx, [authority]);

    console.log(tnx);

    let mkt = await Market.load(
        conn,
        market.publicKey,
        { commitment: "recent" },
        dexProgramId
    );
    console.log('Market created');
    return mkt;
}

const main = async () => {

    const uri = await uploadImageLogo(tokenInfo.image, tokenInfo.tokenName, tokenInfo.symbol, tokenInfo.description);
    metadata.uri = uri;
    console.log("Metadata  :", metadata);

    await createMyToken();

}
async function findVaultOwner(market: PublicKey, dexProgramId: PublicKey): Promise<[PublicKey, BN]> {
    const bump = new BN(0);

    while (bump.toNumber() < 255) {
        try {
            const vaultOwner = await PublicKey.createProgramAddress(
                [market.toBuffer(), bump.toArrayLike(Buffer, "le", 8)],
                dexProgramId
            );

            return [vaultOwner, bump];
        } catch (_e) {
            bump.iaddn(1);
        }
    }

    throw new Error("no seed found for vault owner");
}
export function toPublicKeys(
    obj: Record<string, string | PublicKey | HasPublicKey | any>
): any {
    const newObj :any= {};

    for (const key in obj) {
        const value = obj[key];

        if (typeof value == "string") {
            newObj[key] = new PublicKey(value);
        } else if (typeof value == "object" && "publicKey" in value) {
            newObj[key] = value.publicKey;
        } else {
            newObj[key] = value;
        }
    }

    return newObj;
}

interface HasPublicKey {
    publicKey: PublicKey;
}



createMyToken();