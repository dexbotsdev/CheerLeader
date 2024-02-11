import { BLOXAUTH, connection, mainnetKeyA, privateKey } from "./config";
import { ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { DEFAULT_TOKEN, PROGRAMIDS, addLookupTableInfo, makeTxVersion, wallet } from "./src/constants";
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFile, writeFile } from "fs";
import { Liquidity, MARKET_STATE_LAYOUT_V3, Market, Percent, Token, TokenAmount, buildSimpleTransaction } from "@raydium-io/raydium-sdk";
import { BN } from "@project-serum/anchor";
import { ammCreatePool, buildAndSendTx, calcMarketStartPrice, getWalletTokenAccount, sendTransaction } from "./src/raydiumUtil";
import { AxiosRequestConfig } from "axios";
import { HttpProvider, PostRaydiumSwapResponse } from "@bloxroute/solana-trader-client-ts";
import bs58 from "bs58";
import AmtChecker from "./src/AmtChecker";

const httpTimeout = 30_000
const MAINNET_API_HTTP = 'https://uk.solana.dex.blxrbdn.com'

const PRIORITY_RATE = 100; // MICRO_LAMPORTS 
const SEND_AMT = 0.01 * LAMPORTS_PER_SOL;
const PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_RATE });



async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
            //logger.debug(error);
            return;
        }
        let tokenInfo = JSON.parse(data);
        const baseToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenInfo.baseMint.mint), tokenInfo.baseMint.decimals, tokenInfo.baseMint.name, tokenInfo.baseMint.symbol) // USDC
        const quoteToken = DEFAULT_TOKEN.SOL // RAY
        const targetMarketId = new PublicKey(tokenInfo.marketId)

        const addBaseAmount = new BN(tokenInfo.baseMintAmount)
        const addQuoteAmount = new BN(tokenInfo.quoteMintAmount)


        const startTime = Math.floor(Date.now() / 1000)
        const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)

        /* do something with start price if needed */
        const startPrice = calcMarketStartPrice({ addBaseAmount, addQuoteAmount })
        const startPriceReal = calcMarketStartPrice({ addBaseAmount: new BN(tokenInfo.quoteMintAmount), addQuoteAmount: new BN(tokenInfo.quoteMintAmount) })

        const marketBufferInfo: any = await connection.getAccountInfo(targetMarketId)
        const { baseMint, quoteMint, baseLotSize, quoteLotSize, baseVault, quoteVault, bids, asks, eventQueue } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data)
        console.log(baseMint.toString(), quoteMint.toString(), baseLotSize.toString(), quoteLotSize.toString());
        let poolKeys: any = Liquidity.getAssociatedPoolKeys({
            version: 4,
            marketVersion: 3,
            baseMint,
            quoteMint,
            baseDecimals: tokenInfo.decimals,
            quoteDecimals: 9,
            marketId: targetMarketId,
            programId: PROGRAMIDS.AmmV4,
            marketProgramId: PROGRAMIDS.OPENBOOK_MARKET
        })
        // poolKeys.marketBaseVault = baseVault;
        // poolKeys.marketQuoteVault = quoteVault;
        // poolKeys.marketBids = bids;
        // poolKeys.marketAsks = asks;
        // poolKeys.marketEventQueue = eventQueue;



        ammCreatePool({
            startTime,
            addBaseAmount,
            addQuoteAmount,
            baseToken,
            quoteToken,
            targetMarketId,
            wallet: wallet.payer,
            walletTokenAccounts,
        }).then(async ({ txs }) => {

            console.log('txids')



            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({commitment:'finalized'});
            const slippage = new Percent(10, 100)
            console.log('txids 3')

            const swapTokenAmount = new TokenAmount(quoteToken, 0.01 * 10 ** 9)
            const outTokenAmount = new TokenAmount(baseToken, 1000 * 10 ** 6)
       
            
            const swapInstruction = await Liquidity.makeSwapInstructionSimple({
                connection,
                poolKeys,
                userKeys: {
                    tokenAccounts: walletTokenAccounts, 
                    owner: mainnetKeyA.publicKey,
                },
                amountIn: swapTokenAmount,
                amountOut: outTokenAmount,
                fixedSide: 'in',
                makeTxVersion,
            });
            console.log('txids 4')

            const txList: (VersionedTransaction | Transaction)[] = []
            const txn = new Transaction()
            const txn2 = new Transaction()

            for (const itemIx of txs.innerTransactions) {

                txn.add(...itemIx.instructions)
                txn.feePayer = wallet.publicKey
                txn.recentBlockhash = blockhash
            }
            swapInstruction.innerTransactions[0].instructions.forEach(
                (instruction) => {
                    txn2.add(instruction) 
                    txn2.feePayer = mainnetKeyA.publicKey
                    txn2.recentBlockhash = blockhash
                    txn2.partialSign(mainnetKeyA)
                }
            )
            txn.sign(wallet.payer)

            console.log(' Sending Bundle  - Tnx  ');

            const tnxId = await sendTransaction([txn,txn2],{skipPreflight:true})

            console.log(' Send Bundle completed - Tnx Id is ' + tnxId);



            tokenInfo.poolKeys = poolKeys;

            writeFile('./tokenInfo.json', JSON.stringify(tokenInfo), (err) => {
                if (err) throw err;
                console.log('The file has been saved! Now run --  npm run addLP');
            });


        })



    })

}


start()