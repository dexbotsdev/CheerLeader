import { AddressLookupTableProgram, PublicKey, SystemProgram, Transaction, sendAndConfirmRawTransaction } from "@solana/web3.js";
import { readFile, writeFile } from "fs";
import { DEFAULT_TOKEN, OPENBOOK_DEX_DEVNET, wallet } from "./src/constants";
import { connection } from "./config";
import { Token, MARKET_STATE_LAYOUT_V3, DEVNET_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { getWalletTokenAccount, calcMarketStartPrice, sendTransaction } from "./src/raydiumUtil";





async function start() {

    readFile('./tokenInfo.json', 'utf8',  async (error, data) => {
        if (error) {
             
            return;
        }
        let tokenInfo = JSON.parse(data);

        let { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({ commitment: 'finalized' });
        const rslot = await connection.getSlot({commitment:'finalized'});
        const baseToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenInfo.baseMint.mint), tokenInfo.baseMint.decimals, tokenInfo.baseMint.name, tokenInfo.baseMint.symbol) // USDC
        const quoteToken = DEFAULT_TOKEN.SOL // RAY
        const targetMarketId = new PublicKey(tokenInfo.marketId)

        const addBaseAmount = new BN(tokenInfo.baseMintAmount)
        const addQuoteAmount = new BN(tokenInfo.quoteMintAmount)

        const startTime = Math.floor(Date.now() / 2000)
        const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)

        /* do something with start price if needed */
        const startPrice = calcMarketStartPrice({ addBaseAmount, addQuoteAmount })
        const startPriceReal = calcMarketStartPrice({ addBaseAmount: new BN(tokenInfo.quoteMintAmount), addQuoteAmount: new BN(tokenInfo.quoteMintAmount) })

        const marketBufferInfo: any = await connection.getAccountInfo(targetMarketId)
        let { baseLotSize, quoteLotSize, baseMint, quoteMint, baseVault, quoteVault, bids, asks, eventQueue, requestQueue } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data)
     

        const [lookupTableInst, lookupTableAddress] =
        AddressLookupTableProgram.createLookupTable({
            authority: wallet.publicKey,
            payer: wallet.publicKey,
            recentSlot: rslot 
        });

        const tnx = new Transaction(); 
        tnx.add(lookupTableInst)
        tnx.feePayer=wallet.publicKey,
        tnx.recentBlockhash= blockhash;
        tnx.sign(wallet.payer);

      const tnxId =   await sendAndConfirmRawTransaction(connection,tnx.serialize(),{commitment:'confirmed'});

      const info = JSON.parse(data);

      info.lookupTableAddress = lookupTableAddress;


      const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: wallet.publicKey,
        authority: wallet.publicKey,
        lookupTable: lookupTableAddress,
        addresses: [
            wallet.publicKey, 
            baseMint, quoteMint, baseVault, quoteVault, 
            new PublicKey(OPENBOOK_DEX_DEVNET),
            DEVNET_PROGRAM_ID.AmmV4, 
            DEVNET_PROGRAM_ID.OPENBOOK_MARKET,

        ],
    });
    ({ blockhash } = await connection.getLatestBlockhash({ commitment: 'finalized' }));
    const lookup2tx: any = new Transaction();
    lookup2tx.add(extendInstruction)
    lookup2tx.recentBlockhash = blockhash

    console.log("Adding lookup table address:", lookupTableAddress.toBase58());

    await sendTransaction([lookup2tx]);
      writeFile('./tokenInfo.json', JSON.stringify(info), (err) => {
          if (err) throw err;
          console.log('The file has been saved! Now run --  npm run createPool');
      });


      console.log()
        

    })

}


start()
