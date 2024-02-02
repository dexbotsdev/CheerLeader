import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata, createV1, TokenStandard, mintV1, createAndMint, AuthorityType } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity, generateSigner, percentAmount, signerIdentity, signerPayer, createSignerFromKeypair } from "@metaplex-foundation/umi";
import * as readline from "readline"
import * as util from "util"
import * as process from "process"
import { connection, privateKey, tokenInfo } from '../config';
import { uploadImageLogo } from "./web3utils";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, Signer, Connection } from '@solana/web3.js';
import { DEFAULT_TOKEN, OPENBOOK_DEX, OPENBOOK_DEX_DEVNET, PROGRAMIDS, SERUM_DEX_V3_DEVNET, TransactionWithSigners } from './constants';
import { getVaultOwnerAndNonce } from "./serum";
import { ACCOUNT_SIZE, TOKEN_PROGRAM_ID, createInitializeAccountInstruction } from "@solana/spl-token";
import { DexInstructions, Market } from "@project-serum/serum";
import BN from "bn.js";
import { sendSignedTransaction, signTransactions, sleep } from "./utils";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { web3 } from "@project-serum/anchor";
import {
    sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as splToken from "@solana/spl-token";
import { setAuthority } from "@project-serum/serum/lib/token-instructions";
 import { ASSOCIATED_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";
import { createTokenPool } from "./createPool";
import { MAINNET_PROGRAM_ID, Token } from "@raydium-io/raydium-sdk";


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

const SOL = 'So11111111111111111111111111111111111111112';

const umi = createUmi(tokenInfo.devnet?'https://api.devnet.solana.com':'https://api.mainnet-beta.solana.com');

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


    let totalSupply = 100;

    totalSupply = totalSupply- tokenInfo.addLP;

    tokenInfo.transfers.forEach((item)=>{
        totalSupply = totalSupply-item.partnerShare;
    })

    if(totalSupply<0){
        console.log('Partner Share + Liquidity Amounts exceeds 100%');

        return;
    }



    await createAndMint(umi, {
        mint,
        authority: umi.identity,
        name: metadata.tokenName,
        symbol: metadata.symbol,
        uri: metadata.uri,
        sellerFeeBasisPoints: percentAmount(0),
        decimals: tokenInfo.decimals,
        amount: Number(tokenInfo.supply) * 10 ** tokenInfo.decimals,
        tokenOwner: umi.identity.publicKey,
        tokenStandard: TokenStandard.Fungible,
    }).sendAndConfirm(umi).then(async () => {
        console.log(`\nSuccessfully minted ${tokenInfo.supply} ${tokenInfo.symbol}\nToken Address: ${mint.publicKey}\n`);

        let baseMint: PublicKey;
        let baseMintDecimals: number;

        let quoteMint: PublicKey;
        let quoteMintDecimals: number;
        const vaultInstructions: TransactionInstruction[] = [];
        const vaultSigners: Keypair[] = [];

        const marketInstructions: TransactionInstruction[] = [];
        const marketSigners: Keypair[] = [];


        baseMint = new PublicKey(mint.publicKey);
        baseMintDecimals = tokenInfo.decimals;
        quoteMint = new PublicKey(SOL);
        quoteMintDecimals = 9;


        const marketAccounts = {
            market: Keypair.generate(),
            requestQueue: Keypair.generate(),
            eventQueue: Keypair.generate(),
            bids: Keypair.generate(),
            asks: Keypair.generate(),
            baseVault: Keypair.generate(),
            quoteVault: Keypair.generate(),
        };

        const [vaultOwner, vaultOwnerNonce] = await getVaultOwnerAndNonce(
            marketAccounts.market.publicKey,
            programID
        );

        // create vaults
        vaultInstructions.push(
            ...[
                SystemProgram.createAccount({
                    fromPubkey: wallet.publicKey,
                    newAccountPubkey: marketAccounts.baseVault.publicKey,
                    lamports: await connection.getMinimumBalanceForRentExemption(
                        ACCOUNT_SIZE
                    ),
                    space: ACCOUNT_SIZE,
                    programId: TOKEN_PROGRAM_ID,
                }),
                SystemProgram.createAccount({
                    fromPubkey: wallet.publicKey,
                    newAccountPubkey: marketAccounts.quoteVault.publicKey,
                    lamports: await connection.getMinimumBalanceForRentExemption(
                        ACCOUNT_SIZE
                    ),
                    space: ACCOUNT_SIZE,
                    programId: TOKEN_PROGRAM_ID,
                }),
                createInitializeAccountInstruction(
                    marketAccounts.baseVault.publicKey,
                    baseMint,
                    vaultOwner
                ),
                createInitializeAccountInstruction(
                    marketAccounts.quoteVault.publicKey,
                    quoteMint,
                    vaultOwner
                ),
            ]
        );

        vaultSigners.push(marketAccounts.baseVault, marketAccounts.quoteVault);

        // tickSize and lotSize here are the 1e^(-x) values, so no check for ><= 0
        const baseLotSize = Math.round(
            10 ** baseMintDecimals * Math.pow(10, -1 * 6)
        );
        const quoteLotSize = Math.round(
            10 ** quoteMintDecimals *
            Math.pow(10, -1 * 6) *
            Math.pow(10, -1 * -2)
        );

        // create market account
        marketInstructions.push(
            SystemProgram.createAccount({
                newAccountPubkey: marketAccounts.market.publicKey,
                fromPubkey: privateKey.publicKey,
                space: Market.getLayout(programID).span,
                lamports: await connection.getMinimumBalanceForRentExemption(
                    Market.getLayout(programID).span
                ),
                programId: programID,
            })
        );

        // create request queue
        marketInstructions.push(
            SystemProgram.createAccount({
                newAccountPubkey: marketAccounts.requestQueue.publicKey,
                fromPubkey: privateKey.publicKey,
                space: totalRequestQueueSize,
                lamports: await connection.getMinimumBalanceForRentExemption(
                    totalRequestQueueSize
                ),
                programId: programID,
            })
        );

        // create event queue
        marketInstructions.push(
            SystemProgram.createAccount({
                newAccountPubkey: marketAccounts.eventQueue.publicKey,
                fromPubkey: wallet.publicKey,
                space: totalEventQueueSize,
                lamports: await connection.getMinimumBalanceForRentExemption(
                    totalEventQueueSize
                ),
                programId: programID,
            })
        );

        const orderBookRentExempt =
            await connection.getMinimumBalanceForRentExemption(totalOrderbookSize);

        // create bids
        marketInstructions.push(
            SystemProgram.createAccount({
                newAccountPubkey: marketAccounts.bids.publicKey,
                fromPubkey: wallet.publicKey,
                space: totalOrderbookSize,
                lamports: orderBookRentExempt,
                programId: programID,
            })
        );

        // create asks
        marketInstructions.push(
            SystemProgram.createAccount({
                newAccountPubkey: marketAccounts.asks.publicKey,
                fromPubkey: wallet.publicKey,
                space: totalOrderbookSize,
                lamports: orderBookRentExempt,
                programId: programID,
            })
        );

        marketSigners.push(
            marketAccounts.market,
            marketAccounts.requestQueue,
            marketAccounts.eventQueue,
            marketAccounts.bids,
            marketAccounts.asks
        );


        marketInstructions.push(
            DexInstructions.initializeMarket({
                market: marketAccounts.market.publicKey,
                requestQueue: marketAccounts.requestQueue.publicKey,
                eventQueue: marketAccounts.eventQueue.publicKey,
                bids: marketAccounts.bids.publicKey,
                asks: marketAccounts.asks.publicKey,
                baseVault: marketAccounts.baseVault.publicKey,
                quoteVault: marketAccounts.quoteVault.publicKey,
                baseMint,
                quoteMint,
                baseLotSize: new BN(baseLotSize),
                quoteLotSize: new BN(quoteLotSize),
                feeRateBps: 0, // Unused in v3
                quoteDustThreshold: new BN(1), // Unused in v3
                vaultSignerNonce: vaultOwnerNonce,
                programId: programID,
            })
        );

        const transactionWithSigners: TransactionWithSigners[] = [];
        transactionWithSigners.push(
            {
                transaction: new Transaction().add(...vaultInstructions),
                signers: vaultSigners,
            },
            {
                transaction: new Transaction().add(...marketInstructions),
                signers: marketSigners,
            }
        );

        try {

            console.log(`${marketAccounts.market.publicKey.toBase58()}`);

            const signedTransactions: Transaction[] = await signTransactions({
                transactionsAndSigners: transactionWithSigners,
                wallet,
                connection,
            });
            console.log(signedTransactions);




            // looping creates weird indexing issue with transactionMessages
            const a = await sendSignedTransaction({
                signedTransaction: signedTransactions[0],
                connection,
                skipPreflight: false,
                successCallback: async (txSig) => {

                    console.log(signedTransactions.length > 2
                        ? TRANSACTION_MESSAGES[0].successMessage
                        : TRANSACTION_MESSAGES[1].successMessage)
                },
                sendingCallback: async () => {
                    console.log(signedTransactions.length > 2
                        ? TRANSACTION_MESSAGES[0].sendingMessage
                        : TRANSACTION_MESSAGES[1].sendingMessage)
                },
            });

            if (a) {
                const b = await sendSignedTransaction({
                    signedTransaction: signedTransactions[1],
                    connection,
                    skipPreflight: false,
                    successCallback: async (txSig) => {

                        console.log(signedTransactions.length > 2
                            ? TRANSACTION_MESSAGES[1].successMessage
                            : TRANSACTION_MESSAGES[2].successMessage)

                    },
                    sendingCallback: async () => {
                        console.log(signedTransactions.length > 2
                            ? TRANSACTION_MESSAGES[1].sendingMessage
                            : TRANSACTION_MESSAGES[2].sendingMessage)
                    },
                });
            }

            if (signedTransactions.length > 2) {
                const c = await sendSignedTransaction({
                    signedTransaction: signedTransactions[2],
                    connection,
                    skipPreflight: false,
                    successCallback: async (txSig) => {


                        console.log(TRANSACTION_MESSAGES[2].successMessage)

                    },
                    sendingCallback: async () => {
                        console.log(TRANSACTION_MESSAGES[2].sendingMessage)
                    },
                });
            }

            console.log(`MARKET ID -     ${marketAccounts.market.publicKey.toBase58()}`)
            console.log(`BASE MINT -     ${baseMint.toBase58()}`)
            console.log(`QUOTE MINT -     ${quoteMint.toBase58()}`)
            console.log(`SUPPLY  -     ${metadata.tokenSupply}`)

            // console.log(`TRANSFERRING TOKEN SHARES TO PARTNERS -     `)

            // const tokenAccount = await splToken.getAssociatedTokenAddress(
            //     baseMint,
            //     privateKey.publicKey
            // )
            // console.log(`associated token account is  -     ` + tokenAccount)

            // tokenInfo.transfers.forEach(async (transfer) => {
            //     let transfers = new Transaction();

            //     let destTokenAccount = await splToken.getAssociatedTokenAddress(
            //         baseMint,
            //         new PublicKey(transfer.partnerId)
            //     )

            //     const receiverAccount = await connection.getAccountInfo(
            //         destTokenAccount
            //     )

            //     if (receiverAccount === null) {
            //         transfers.add(
            //             splToken.createAssociatedTokenAccountInstruction(
            //                 privateKey.publicKey,
            //                 destTokenAccount,
            //                 new PublicKey(transfer.partnerId),
            //                 baseMint,
            //                 TOKEN_PROGRAM_ID,
            //                 splToken.ASSOCIATED_TOKEN_PROGRAM_ID
            //             )
            //         )
            //     } 
            //     const transferAmount = (0.01)*transfer.partnerShare*Number(tokenInfo.supply)**10*(tokenInfo.decimals);
            //     transfers.add(
            //         splToken.createTransferInstruction(
            //             tokenAccount,
            //           destTokenAccount,
            //           privateKey.publicKey,
            //           transferAmount
            //         )
            //       )
            //     const tfrtransactionId = await sendAndConfirmTransaction(
            //         connection,
            //         transfers,
            //         [privateKey]
            //     );
            //     console.log(`TRANSFERRED PARTNER TOKENS  -     ` + tfrtransactionId)

            // })



            let authorityTransaction = new Transaction().add(
                splToken.createSetAuthorityInstruction(
                    baseMint, // mint acocunt || token account
                    privateKey.publicKey,
                    splToken.AuthorityType.MintTokens,
                    null,
                    [],
                    TOKEN_PROGRAM_ID
                )
            );
            console.log(`REVOKING MINT AUTHORITY  -     `)


            const transactionId = await sendAndConfirmTransaction(
                connection,
                authorityTransaction,
                [privateKey]
            ).catch((error)=>{
                console.log(error)
            })

            console.log(`REVOKED MINT AUTHORITY  -     ` + transactionId)


            let revokeTransaction = new Transaction().add(
                splToken.createSetAuthorityInstruction(
                    baseMint, // mint acocunt || token account
                    privateKey.publicKey,
                    splToken.AuthorityType.FreezeAccount,
                    null,
                    [],
                    TOKEN_PROGRAM_ID
                )
            );
            console.log(`REVOKING FREEZE AUTHORITY  -     `)


            const revokeTransactionId = await sendAndConfirmTransaction(
                connection,
                revokeTransaction,
                [privateKey]
            ).catch((error)=>{
                console.log(error)
            })

            console.log(`REVOKED FREEZE AUTHORITY  -     ` + revokeTransactionId)


           console.log(`Creating Pool  -     `  )

          const tokenPoolInfo ={
            baseMint: new Token(TOKEN_PROGRAM_ID, baseMint, tokenInfo.decimals, tokenInfo.tokenName, tokenInfo.symbol),
            quoteMint:DEFAULT_TOKEN.SOL,
            baseMintAmount: (0.01)*tokenInfo.addLP*Number(tokenInfo.supply)* 10 ** tokenInfo.decimals,
            quoteMintAmount: tokenInfo.addSol* 10 ** 9,
            marketId:marketAccounts.market.publicKey
          }

            await createTokenPool(tokenPoolInfo);

            return;


        } catch (e) {
            console.error("[explorer]: ", e);

        }

    })

}


const main = async () => {

    const uri = await uploadImageLogo(tokenInfo.image, tokenInfo.tokenName, tokenInfo.symbol, tokenInfo.description);
    metadata.uri = uri;
     

    await createMyToken();

}




main();