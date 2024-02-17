import { connection, privateKey, NFT_STORAGE_TOKEN, tokenInfo, RPC_URL } from "./config";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Metaplex, keypairIdentity, toBigNumber, irysStorage, token } from "@metaplex-foundation/js";
import { METAPLEX, SOL, metadata, revokeFreezeAuthority, revokeMintAuthority, umi, uploadImage, userWallet, userWalletSigner } from "./src/web3utils";
import { CandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { generateSigner, percentAmount, signerIdentity } from "@metaplex-foundation/umi";
import { DEFAULT_TOKEN, PROGRAMIDS, TransactionWithSigners, addLookupTableInfo, makeTxVersion, wallet } from "./src/constants";
import { TokenStandard, createAndMint, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { ACCOUNT_SIZE, TOKEN_PROGRAM_ID, createInitializeAccountInstruction, createMint, mintTo } from '@solana/spl-token';
import { readFile, writeFile } from "fs";
import { getVaultOwnerAndNonce } from "./src/serum";
import { sendSignedTransaction, signTransactions } from "./src/utils";
import { BN } from "@project-serum/anchor";
import { DexInstructions, Market } from "@project-serum/serum";
import { DEVNET_PROGRAM_ID, MarketV2, Token, buildSimpleTransaction } from "@raydium-io/raydium-sdk";
import { buildAndSendTx } from "./src/raydiumUtil";

let baseMint: PublicKey;
let baseMintDecimals: number;
let quoteMint: PublicKey;
let quoteMintDecimals: number;
const vaultInstructions: TransactionInstruction[] = [];
const vaultSigners: Keypair[] = [];
const marketInstructions: TransactionInstruction[] = [];
const marketSigners: Keypair[] = [];

const totalEventQueueSize = 11308
const totalRequestQueueSize = 844
const totalOrderbookSize = 14524
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
const programID = new PublicKey(PROGRAMIDS.OPENBOOK_MARKET);

async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
            //logger.debug(error);
            return;
        }
        let tokenInfo = JSON.parse(data);
        baseMint = new PublicKey(tokenInfo.baseMint.mint);
        baseMintDecimals = tokenInfo.decimals;
        quoteMint = new PublicKey(SOL);
        quoteMintDecimals = 9;
        const baseToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenInfo.baseMint.mint), tokenInfo.decimals, tokenInfo.name, tokenInfo.symbol) // USDC
        const quoteToken = DEFAULT_TOKEN.SOL // RAY
       
        const createMarketInstruments = await MarketV2.makeCreateMarketInstructionSimple({
            connection,
            wallet: wallet.publicKey,
            baseInfo: baseToken,
            quoteInfo: quoteToken,
            lotSize: 1, // default 1
            tickSize: 0.01, // default 0.01
            dexProgramId: DEVNET_PROGRAM_ID.OPENBOOK_MARKET,
            makeTxVersion,
          })
          const willSendTx = await buildSimpleTransaction({
            connection,
            makeTxVersion,
            payer: wallet.publicKey,
            innerTransactions: createMarketInstruments.innerTransactions,
            addLookupTableInfo: addLookupTableInfo,
          })

         console.log(JSON.stringify(createMarketInstruments.innerTransactions[0].instructions,null,2));
       
    })

}


start()