import { Connection, Keypair } from "@solana/web3.js"

export const tokenInfo={ 
    tokenName:"TEST101",
    decimals:6,
    symbol:"TEST",
    supply: "1000000",
    image: "./Logo.webp",
    fees:"0.025",
    description:"The $ABC is a home video game console developed and marketed by Nintendo",

    addLP: 90,
    addSol: 0.1,
    transfers:[
        {
            partnerId:'DbGWZNB8e9X8tsVhZuZjCXGxcfRCiRZDLLSNUXwns9Nb',
            partnerShare: 10
        } 
    ],
    createPool: true,
    burnPool:true,
    revokeToken:true,
    startAfterXMinutes: 0,
    devnet:true
}



export const connection = tokenInfo.devnet? new Connection('https://api.devnet.solana.com','confirmed'):  new Connection('https://solana-mainnet.g.alchemy.com/v2/HDr7q2-W0P_Vx9oJ71EU4bw6fnW9YsoF','confirmed')

export const privateKey  = Keypair.fromSecretKey(Uint8Array.from([184,220,93,79,111,221,162,175,39,88,186,3,132,85,148,254,67,135,120,119,197,148,223,178,168,160,209,127,142,236,134,116,101,209,141,19,184,25,232,186,98,186,61,206,27,58,91,118,57,252,83,135,76,14,95,100,233,32,194,47,96,104,165,107]))
export const privateKey1 = Keypair.fromSecretKey(Uint8Array.from([194,15,87,216,2,103,168,217,83,156,131,243,33,41,231,102,2,50,98,199,245,98,167,0,35,151,137,134,117,222,108,188,215,213,239,173,123,34,254,237,229,68,0,85,39,219,190,55,59,93,149,40,154,200,72,65,133,60,220,253,83,143,201,77]))
export const NFT_STORAGE_TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDAxQzM4ZGVhN0QwQTcxRkIyY0NGOGIzYzliMWVmMDk3Mjc0MUY2ODYiLCJpc3MiOiJuZnQtc3RvcmFnZSIsImlhdCI6MTcwMTkxNDE5MDY3MCwibmFtZSI6Im9yZGluYW5jZSJ9.DR8xEjrABHIXPV3tBktejuG7br0r672brDF4Fy-fvBY'


