import { connection, mainnetKeyA, privateKey } from "./config";
import { PublicKey, Transaction, VersionedTransaction, sendAndConfirmRawTransaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { DEFAULT_TOKEN, PROGRAMIDS, addLookupTableInfo, makeTxVersion, wallet } from "./src/constants";
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFile, writeFile } from "fs";
import { Liquidity, LiquidityPoolKeys, MARKET_STATE_LAYOUT_V3, Market, Percent, Token, TokenAmount, buildSimpleTransaction, jsonInfo2PoolKeys } from "@raydium-io/raydium-sdk";
import { BN } from "@project-serum/anchor";
import { ammCreatePool, buildAndSendTx, calcMarketStartPrice, getWalletTokenAccount, sendTransaction, sendTx } from "./src/raydiumUtil";
import { formatAmmKeysById } from "./src/formatAmmKeysById";
import Decimal from 'decimal.js';

async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
            //logger.debug(error);
            return;
        }
        const tokenInfo = JSON.parse(data);
        const baseToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenInfo.baseMint.mint), tokenInfo.baseMint.decimals, tokenInfo.baseMint.name, tokenInfo.baseMint.symbol) // USDC
        const quoteToken = DEFAULT_TOKEN.SOL // RAY
        const targetMarketId = new PublicKey(tokenInfo.marketId)
        const addBaseAmount = new BN(tokenInfo.baseMintAmount).sub(new BN(1 * 10**6)) // 10000 / 10 ** 6,
        const addQuoteAmount = new BN(tokenInfo.quoteMintAmount)
        const startTime = Math.floor(Date.now() / 1000) + 5 * 60
        const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)

        /* do something with start price if needed */
        const startPrice = calcMarketStartPrice({ addBaseAmount, addQuoteAmount })
        const slippage = new Percent(1, 100)


        const targetPoolInfo = await formatAmmKeysById(tokenInfo.poolKeys.id)

        const inputTokenAmount = new TokenAmount(baseToken, addBaseAmount)
        const swapTokenAmount = new TokenAmount(quoteToken, 0.01*10**9)

        // -------- step 1: compute another amount --------
        const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys
        const extraPoolInfo = await Liquidity.fetchInfo({ connection, poolKeys })
        const { maxAnotherAmount, anotherAmount, liquidity } = Liquidity.computeAnotherAmount({
            poolKeys,
            poolInfo: { ...targetPoolInfo, ...extraPoolInfo },
            amount: inputTokenAmount,
            anotherCurrency: quoteToken,
            slippage: slippage,
        })

        console.log('will add liquidity info', {maxAnotherAmount, anotherAmount,
            liquidity: liquidity.toString(),
            liquidityD: new Decimal(liquidity.toString()).div(10 ** extraPoolInfo.lpDecimals),
        })
        const addLiquidityInstructionResponse = await Liquidity.makeAddLiquidityInstructionSimple({
            connection,
            poolKeys,
            userKeys: {
                owner: wallet.publicKey,
                payer: wallet.publicKey,
                tokenAccounts: walletTokenAccounts,
            },
            amountInA: inputTokenAmount,
            amountInB: maxAnotherAmount,
            fixedSide: 'a',
            makeTxVersion,
        })

        const willSendTx = await buildSimpleTransaction({
            connection,
            makeTxVersion,
            payer: wallet.publicKey,
            innerTransactions: addLiquidityInstructionResponse.innerTransactions,
            addLookupTableInfo: addLookupTableInfo,
        })

        const { innerTransactions: swapTransactions } = await Liquidity.makeSwapInstructionSimple({
            connection,
            poolKeys,
            userKeys: {
                tokenAccounts: walletTokenAccounts,
                owner: mainnetKeyA.publicKey,
            },
            amountIn: swapTokenAmount,
            amountOut: new TokenAmount(baseToken, '100', false),
            fixedSide: 'in',
            makeTxVersion,
        });


        console.log(' Creating Swap Transactions ');

        console.log(swapTransactions)

        const txListSwap = await buildSimpleTransaction({
            connection,
            makeTxVersion,
            payer: mainnetKeyA.publicKey,
            innerTransactions: swapTransactions,
            addLookupTableInfo: addLookupTableInfo,
        })
        
        const txList: (VersionedTransaction | Transaction)[] = []


        for (const itemIx of willSendTx) {
            txList.push(itemIx)
          }
        for (const itemIx of txListSwap) {
            txList.push(itemIx)
          }

          return await sendTransaction( txList).then((tnxId)=>{

            console.log(tnxId);
          })

 
    })

}


start()