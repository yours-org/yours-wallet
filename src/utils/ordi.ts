
import { P2PKHAddress, Script } from "bsv-wasm-web";


export const ContentType = {
    BSV20: 'application/bsv-20',
}


/** Ordinal Inscription */
export type Inscription = {
    /** content in utf8 text or Buffer */
    content: string | Buffer
    /** contentType in text */
    contentType: string
}

export type BSV20V1_DEPLOY_JSON = {
    p: 'bsv-20'
    op: 'deploy'
    tick: string
    max: string
    lim?: string
    dec?: string
}

export type BSV20V1_MINT_JSON = {
    p: 'bsv-20'
    op: 'mint'
    tick: string
    amt: string
}

export type BSV20V1_TRANSFER_JSON = {
    p: 'bsv-20'
    op: 'transfer'
    tick: string
    amt: string
}

export type BSV20V1_JSON =
    | BSV20V1_DEPLOY_JSON
    | BSV20V1_MINT_JSON
    | BSV20V1_TRANSFER_JSON

export type BSV20V2_DEPLOY_MINT_JSON = {
    p: 'bsv-20'
    op: 'deploy+mint'
    amt: string
    dec?: string
}

export type BSV20V2_TRANSFER_JSON = {
    p: 'bsv-20'
    op: 'transfer'
    id: string
    amt: string
}

export type BSV20V2_JSON = BSV20V2_DEPLOY_MINT_JSON | BSV20V2_TRANSFER_JSON

export type BSV20_JSON = BSV20V1_JSON | BSV20V2_JSON


function isOrdinalAfterP2PKH(script: Script): boolean {
    const chunks = script.to_asm_string().split(" ").map(c => c.trim());
    return (
        chunks.length === 13 &&
        chunks[0] === "OP_DUP" &&
        chunks[1] === "OP_HASH160" &&
        Buffer.from(chunks[2], 'hex').length === 20 &&
        chunks[3] === "OP_EQUALVERIFY" &&
        chunks[4] === "OP_CHECKSIG" &&
        chunks[5] === "0" &&
        chunks[6] === "OP_IF" &&
        chunks[7] === "6f7264" &&
        chunks[8] === "OP_1" &&
        Buffer.from(chunks[9], 'hex').length > 0 &&
        chunks[10] === "0" &&
        Buffer.from(chunks[11], 'hex').length > 0 &&
        chunks[12] === "OP_ENDIF"
    )
}

function isOrdinalBeforeP2PKH(script: Script): boolean {
    const chunks = script.to_asm_string().split(" ").map(c => c.trim());
    return (
        chunks.length === 13 &&
        chunks[0] === "0" &&
        chunks[1] === "OP_IF" &&
        chunks[2] === '6f7264' &&
        chunks[3] === "OP_1" &&
        Buffer.from(chunks[4], 'hex').length > 0 &&
        chunks[5] === "0" &&
        Buffer.from(chunks[6], 'hex').length > 0 &&
        chunks[7] === "OP_ENDIF" &&
        chunks[8] === "OP_DUP" &&
        chunks[9] === "OP_HASH160" &&
        Buffer.from(chunks[10], 'hex').length === 20 &&
        chunks[11] === "OP_EQUALVERIFY" &&
        chunks[12] === "OP_CHECKSIG"
    )
}

export function isOrdinalP2PKH(script: Script): boolean {
    return (
        isOrdinalAfterP2PKH(script) || isOrdinalBeforeP2PKH(script)
    )
}


function get_at(script: Script, index: number) {
    const chunks = script.to_asm_string().split(" ").map(c => c.trim());
    return chunks[index];
}

export function getInscription(script: Script): Inscription | undefined {

    if (isOrdinalAfterP2PKH(script)) {
        return {
            content: fromByteString(get_at(script, 11)),
            contentType: fromByteString(get_at(script, 9))
        }
    }

    if (isOrdinalBeforeP2PKH(script)) {
        return {
            content: fromByteString(get_at(script, 6)),
            contentType: fromByteString(get_at(script, 4))
        }
    }
}



export function getBsv20v1(script: Script): BSV20V1_JSON {

    let i = getInscription(script);

    if (!i) {
        throw new Error(`doesn't contains any inscription!`)
    }

    const { contentType, content } = i;
    if (contentType !== ContentType.BSV20) {
        throw new Error(`invalid bsv20 contentType: ${contentType}`)
    }
    const bsv20P = 'bsv-20'

    const bsv20 = JSON.parse(content as string)

    if (
        bsv20.p === bsv20P &&
        bsv20.op === 'deploy' &&
        typeof bsv20.tick === 'string' &&
        typeof bsv20.max === 'string'
    ) {
        // BSV20V1_DEPLOY_JSON
        return bsv20
    } else if (
        bsv20.p === bsv20P &&
        bsv20.op === 'mint' &&
        typeof bsv20.tick === 'string' &&
        typeof bsv20.amt === 'string'
    ) {
        // BSV20V1_MINT_JSON
        return bsv20
    } else if (
        bsv20.p === bsv20P &&
        bsv20.op === 'transfer' &&
        typeof bsv20.tick === 'string' &&
        typeof bsv20.amt === 'string'
    ) {
        // BSV20V1_TRANSFER_JSON
        return bsv20
    }

    throw new Error(`invalid bsv20 v1 json, ${content}`)
}

export function getBsv20v2(script: Script): BSV20V2_JSON {

    let i = getInscription(script);

    if (!i) {
        throw new Error(`doesn't contains any inscription!`)
    }

    const { contentType, content } = i;
    if (contentType !== ContentType.BSV20) {
        throw new Error(`invalid bsv20 contentType: ${contentType}`)
    }

    const bsv20 = JSON.parse(content as string)
    const bsv20P = 'bsv-20'

    if (
        bsv20.p === bsv20P &&
        bsv20.op === 'deploy+mint' &&
        typeof bsv20.amt === 'string'
    ) {
        // BSV20V2_DEPLOY_MINT_JSON
        return bsv20
    } else if (
        bsv20.p === bsv20P &&
        bsv20.op === 'transfer' &&
        typeof bsv20.id === 'string' &&
        typeof bsv20.amt === 'string'
    ) {
        // BSV20V2_TRANSFER_JSON
        return bsv20
    }

    throw new Error(`invalid bsv20 v2 json, ${content}`)
}

export function getAmtv1(script: Script): bigint {
    const bsv20 = getBsv20v1(script) as BSV20V1_JSON

    if (bsv20.op === 'mint' || bsv20.op === 'transfer') {
        return BigInt(bsv20.amt)
    }

    throw new Error(`invalid bsv20 op: ${bsv20.op}`)
}


export function getAmtv2(script: Script): bigint {
    const bsv20 = getBsv20v2(script) as BSV20V2_JSON
    return BigInt(bsv20.amt)
}


export function create(inscription: Inscription): Script {
    const contentTypeBytes = toByteString(inscription.contentType)
    const contentBytes =
        inscription.content instanceof Buffer
            ? toByteString(inscription.content.toString('hex'))
            : toByteString(inscription.content)
    const asm = `OP_0 OP_IF 6f7264 OP_1 ${contentTypeBytes} OP_0 ${contentBytes} OP_ENDIF`;
    return Script.from_asm_string(asm)
}

export function createTransfer(tick: string, amt: bigint): Script {
    return create({
        content: JSON.stringify({
            p: 'bsv-20',
            op: 'transfer',
            tick,
            amt: amt.toString().replace(/n/, ''),
        }),
        contentType: ContentType.BSV20,
    })
}

export function createTransferP2PKH(address: string, tick: string, amt: bigint): Script {
    return Script.from_hex(createTransfer(tick, amt).to_hex()
        + P2PKHAddress.from_string(address).get_locking_script().to_hex())
}


export function createTransferV2(id: string, amt: bigint): Script {
    return create({
        content: JSON.stringify({
            p: 'bsv-20',
            op: 'transfer',
            id,
            amt: amt.toString().replace(/n/, ''),
        }),
        contentType: ContentType.BSV20,
    })
}

export function createTransferV2P2PKH(address: string, id: string, amt: bigint): Script {
    return Script.from_hex(createTransferV2(id, amt).to_hex()
        + P2PKHAddress.from_string(address).get_locking_script().to_hex())
}


export function fromByteString(bs: string): string {
    const encoder = new TextDecoder()
    return encoder.decode(Buffer.from(bs, 'hex'))
}

export function toByteString(str: string): string {
    const encoder = new TextEncoder();
    const uint8array = encoder.encode(str);
    return Buffer.from(uint8array).toString('hex');
}

export function showAmount(amt: bigint, dec: number): string {
    const amtStr = amt.toString().replace(/n/, "");

    if (dec === 0) {
        return amtStr;
    }

    let left = amt / BigInt(Math.pow(10, dec));
    let right = amt % BigInt(Math.pow(10, dec));
    if (right > 0) {
        return `${left}.${right}`
    }
    return `${left}`
}

export function normalize(amt: string, dec: number):string {

    if (dec === 0) {

        if (/\d+\.\d+/.test(amt)) {
            return amt.split(".")[0];
        }

        return amt
    } else {
        if (/\d+\.\d+/.test(amt)) {
            const [l, r] = amt.split(".");
            return (BigInt(l) * BigInt(Math.pow(10, dec)) + BigInt(r.slice(0, dec))).toString().replace(/n/, "")
        } else {
            return amt.split(".")[0] + Math.pow(10, dec).toString().replace(/1/, "");
        }
    }

}


export function isBSV20v2(tick: string) {
    return /^[a-fA-F0-9]{64}_\d+$/.test(tick);
}