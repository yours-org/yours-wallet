/* tslint:disable */
/* eslint-disable */
/**
*/
export enum OpCodes {
/**
* Pushes 0 onto the stack
*/
  OP_0 = 0,
/**
* Pushes 0 onto the stack
* The next byte sets the number of bytes to push onto the stack
*/
  OP_PUSHDATA1 = 76,
/**
* The next two bytes sets the number of bytes to push onto the stack
*/
  OP_PUSHDATA2 = 77,
/**
* The next four bytes sets the number of bytes to push onto the stack
*/
  OP_PUSHDATA4 = 78,
/**
* Pushes -1 onto the stack
*/
  OP_1NEGATE = 79,
/**
* Pushes 1 onto the stack
*/
  OP_1 = 81,
/**
* Pushes 1 onto the stack
* Pushes 2 onto the stack
*/
  OP_2 = 82,
/**
* Pushes 3 onto the stack
*/
  OP_3 = 83,
/**
* Pushes 4 onto the stack
*/
  OP_4 = 84,
/**
* Pushes 5 onto the stack
*/
  OP_5 = 85,
/**
* Pushes 6 onto the stack
*/
  OP_6 = 86,
/**
* Pushes 7 onto the stack
*/
  OP_7 = 87,
/**
* Pushes 8 onto the stack
*/
  OP_8 = 88,
/**
* Pushes 9 onto the stack
*/
  OP_9 = 89,
/**
* Pushes 10 onto the stack
*/
  OP_10 = 90,
/**
* Pushes 11 onto the stack
*/
  OP_11 = 91,
/**
* Pushes 12 onto the stack
*/
  OP_12 = 92,
/**
* Pushes 13 onto the stack
*/
  OP_13 = 93,
/**
* Pushes 14 onto the stack
*/
  OP_14 = 94,
/**
* Pushes 15 onto the stack
*/
  OP_15 = 95,
/**
* Pushes 16 onto the stack
*/
  OP_16 = 96,
/**
* Does nothing
*/
  OP_NOP = 97,
/**
* If the top stack is true, statements are executed. Top stack value is removed.
*/
  OP_IF = 99,
/**
* If the top stack is false, statements are executed. Top stack value is removed.
*/
  OP_NOTIF = 100,
/**
* If the preceding OP_IF or OP_NOTIF statemetns were not executed, then statements are executed.
*/
  OP_ELSE = 103,
/**
* Ends an if-else block
*/
  OP_ENDIF = 104,
/**
* Marks a statement as invalid if the top stack value is false. Top stack value is removed.
*/
  OP_VERIFY = 105,
/**
* Marks a statements as invalid
*/
  OP_RETURN = 106,
/**
* Moves the top item on the main stack to the alt stack
*/
  OP_TOALTSTACK = 107,
/**
* Moves the top item on the alt stack to the main stack
*/
  OP_FROMALTSTACK = 108,
/**
* Duplicates the top stack value if it is not zero
*/
  OP_IFDUP = 115,
/**
* Puts the number of stack items onto the stack
*/
  OP_DEPTH = 116,
/**
* Drops the top stack value
*/
  OP_DROP = 117,
/**
* Duplicates the top stack item
*/
  OP_DUP = 118,
/**
* Removes the second-to-top stack item
*/
  OP_NIP = 119,
/**
* Copies the second-to-top stack item to the top
*/
  OP_OVER = 120,
/**
* The item n back in the stack is copied to the top
*/
  OP_PICK = 121,
/**
* The item n back in the stack is moved to the top
*/
  OP_ROLL = 122,
/**
* The top three items on the stack are rotated to the left
*/
  OP_ROT = 123,
/**
* The top two items on the stack are swapped
*/
  OP_SWAP = 124,
/**
* The item at the top of the stack is copied and inserted before the second-to-top item
*/
  OP_TUCK = 125,
/**
* Removes the top two items from the stack
*/
  OP_2DROP = 109,
/**
* Duplicates the top two stack items
*/
  OP_2DUP = 110,
/**
* Duplicates the top three stack items
*/
  OP_3DUP = 111,
/**
* Copies the pair of items two spaces back to the front
*/
  OP_2OVER = 112,
/**
* The fifth and sixth items back are moved to the top of the stack
*/
  OP_2ROT = 113,
/**
* Swaps the top two pairs of items
*/
  OP_2SWAP = 114,
/**
* Concatenates two byte sequences
*/
  OP_CAT = 126,
/**
* Splits the byte sequence at position n
*/
  OP_SPLIT = 127,
/**
* Pushes the byte sequence length of the top stack item without popping it
*/
  OP_SIZE = 130,
/**
* Flips all of the bits in the input
*/
  OP_INVERT = 131,
/**
* Boolean and between each bit in the inputs
*/
  OP_AND = 132,
/**
* Boolean or between each bit in the inputs
*/
  OP_OR = 133,
/**
* Boolean exclusive or between each bit in the inputs
*/
  OP_XOR = 134,
/**
* Returns 1 if the inputs are exactly equal, 0 otherwise
*/
  OP_EQUAL = 135,
/**
* Same as OP_EQUAL, but runs OP_VERIFY afterward
*/
  OP_EQUALVERIFY = 136,
/**
* Adds 1 to the input
*/
  OP_1ADD = 139,
/**
* Subtracts 1 from the input
*/
  OP_1SUB = 140,
/**
* The sign of the input is flipped
*/
  OP_NEGATE = 143,
/**
* The input is made positive
*/
  OP_ABS = 144,
/**
* If the input is 0 or 1, it is flipped. Otherwise, the output will be 0.
*/
  OP_NOT = 145,
/**
* Returns 0 if the input is 0. 1 otherwise.
*/
  OP_0NOTEQUAL = 146,
/**
* Adds a to b
*/
  OP_ADD = 147,
/**
* Subtracts b from a
*/
  OP_SUB = 148,
/**
* Multiplies a by b
*/
  OP_MUL = 149,
/**
* Divides a by b
*/
  OP_DIV = 150,
/**
* Returns the remainder after dividing a by b
*/
  OP_MOD = 151,
/**
* Shifts a left b bits, preserving sign
*/
  OP_LSHIFT = 152,
/**
* Shifts a right b bits, preserving sign
*/
  OP_RSHIFT = 153,
/**
* If both a and b are not empty, the output is 1. Otherwise, 0.
*/
  OP_BOOLAND = 154,
/**
* If a or b is not empty, the output is 1. Otherwise, 0.
*/
  OP_BOOLOR = 155,
/**
* Returns 1 if the numbers are equal. Otherwise, 0.
*/
  OP_NUMEQUAL = 156,
/**
* Same as OP_NUMEQUAL, but runs OP_VERIFY afterward
*/
  OP_NUMEQUALVERIFY = 157,
/**
* Returns 1 if the numbers are not equal. Otherwise, 0.
*/
  OP_NUMNOTEQUAL = 158,
/**
* Returns 1 if a is less than b. Otherwise, 0.
*/
  OP_LESSTHAN = 159,
/**
* Returns 1 if a is greater than b. Otherwise, 0.
*/
  OP_GREATERTHAN = 160,
/**
* Returns 1 if a is less than or equal to b. Otherwise, 0.
*/
  OP_LESSTHANOREQUAL = 161,
/**
* Returns 1 if a is greater than or equal to b. Otherwise, 0.
*/
  OP_GREATERTHANOREQUAL = 162,
/**
* Returns the smaller of a and b
*/
  OP_MIN = 163,
/**
* Returns the larger of a and b
*/
  OP_MAX = 164,
/**
* Returns 1 if x is within the specified range, left inclusive. Otherwise, 0.
*/
  OP_WITHIN = 165,
/**
* Converts numeric value a into a byte sequence of length b
*/
  OP_NUM2BIN = 128,
/**
* Converts byte sequence x into a numeric value
*/
  OP_BIN2NUM = 129,
/**
* The input is hashed using RIPEMD-160
*/
  OP_RIPEMD160 = 166,
/**
* The input is hashed using SHA-1
*/
  OP_SHA1 = 167,
/**
* The input is hashed using SHA-256
*/
  OP_SHA256 = 168,
/**
* The input is hashed twice: first with SHA-256 and then with RIPEMD-160
*/
  OP_HASH160 = 169,
/**
* The input is hashed two times with SHA-256
*/
  OP_HASH256 = 170,
/**
* Marks the part of the script after which the signature will begin matching
*/
  OP_CODESEPARATOR = 171,
/**
* Puts 1 on the stack if the signature authorizes the public key and transaction hash. Otherwise 0.
*/
  OP_CHECKSIG = 172,
/**
* Same as OP_CHECKSIG, but OP_VERIFY is executed afterward
*/
  OP_CHECKSIGVERIFY = 173,
/**
* Puts 1 on the stack if m of n signatures authorize the public key and transaction hash. Otherwise 0.
*/
  OP_CHECKMULTISIG = 174,
/**
* Same as OP_CHECKMULTISIG, but OP_VERIFY is executed afterward
*/
  OP_CHECKMULTISIGVERIFY = 175,
/**
* Marks transaction as invalid if the top stack item is greater than the transaction's lock_time
*/
  OP_CHECKLOCKTIMEVERIFY = 177,
/**
* Marks transaction as invalid if the top stack item is less than the transaction's sequence used for relative lock time
*/
  OP_CHECKSEQUENCEVERIFY = 178,
/**
* OP_DATA followed by a varint represents arbitrary data on chain. Used for matching Script Templates.
*/
  OP_DATA = 251,
/**
* Represents a secp256k1 signature
*/
  OP_SIG = 252,
/**
* Represents a public key hashed with OP_HASH160
*/
  OP_PUBKEYHASH = 253,
/**
* Represents a public key compatible with OP_CHECKSIG
*/
  OP_PUBKEY = 254,
/**
* Matches any opcode that is not yet assigned
*/
  OP_INVALIDOPCODE = 255,
/**
* Transaction is invalid unless occuring in an unexecuted OP_IF branch
*/
  OP_RESERVED = 80,
/**
* Transaction is invalid unless occuring in an unexecuted OP_IF branch
*/
  OP_VER = 98,
/**
* Transaction is invalid even when occuring in an unexecuted OP_IF branch
*/
  OP_VERIF = 101,
/**
* Transaction is invalid even when occuring in an unexecuted OP_IF branch
*/
  OP_VERNOTIF = 102,
/**
* Transaction is invalid unless occuring in an unexecuted OP_IF branch
*/
  OP_RESERVED1 = 137,
/**
* Transaction is invalid unless occuring in an unexecuted OP_IF branch
*/
  OP_RESERVED2 = 138,
/**
* The word is ignored. Does not mark transaction as invalid.
*/
  OP_NOP1 = 176,
/**
* The word is ignored. Does not mark transaction as invalid.
*/
  OP_NOP4 = 179,
/**
* The word is ignored. Does not mark transaction as invalid.
*/
  OP_NOP5 = 180,
/**
* The word is ignored. Does not mark transaction as invalid.
*/
  OP_NOP6 = 181,
/**
* The word is ignored. Does not mark transaction as invalid.
*/
  OP_NOP7 = 182,
/**
* The word is ignored. Does not mark transaction as invalid.
*/
  OP_NOP8 = 183,
/**
* The word is ignored. Does not mark transaction as invalid.
*/
  OP_NOP9 = 184,
/**
* The word is ignored. Does not mark transaction as invalid.
*/
  OP_NOP10 = 185,
/**
* Words at or above this number are invalid
*/
  OP_INVALID_ABOVE = 186,
/**
* The input is multiplied by 2
*/
  OP_2MUL = 141,
/**
* The input is divided by 2
*/
  OP_2DIV = 142,
}
/**
*/
export enum SigHash {
  FORKID = 64,
  ALL = 1,
  NONE = 2,
  SINGLE = 3,
  ANYONECANPAY = 128,
/**
*
*     * ALL | FORKID
*     
*/
  InputsOutputs = 65,
/**
*
*     * NONE | FORKID
*     
*/
  Inputs = 66,
/**
*
*     * SINGLE | FORKID
*     
*/
  InputsOutput = 67,
/**
*
*     * ALL | ANYONECANPAY | FORKID
*     
*/
  InputOutputs = 193,
/**
*
*     * NONE | ANYONECANPAY | FORKID
*     
*/
  Input = 194,
/**
*
*     * SINGLE | ANYONECANPAY | FORKID
*     
*/
  InputOutput = 195,
/**
*
*     * ALL | ANYONECANPAY
*     
*/
  Legacy_InputOutputs = 129,
/**
*
*     * NONE | ANYONECANPAY
*     
*/
  Legacy_Input = 130,
/**
*
*     * SINGLE | ANYONECANPAY
*     
*/
  Legacy_InputOutput = 131,
}
/**
*/
export enum Status {
  Running = 0,
  Finished = 1,
}
/**
*/
export enum SigningHash {
  Sha256 = 0,
  Sha256d = 1,
}
/**
*/
export enum AESAlgorithms {
  AES128_CBC = 0,
  AES256_CBC = 1,
  AES128_CTR = 2,
  AES256_CTR = 3,
}
/**
*/
export enum PBKDF2Hashes {
  SHA1 = 0,
  SHA256 = 1,
  SHA512 = 2,
}
/**
*/
export class AES {
  free(): void;
/**
* @param {Uint8Array} key
* @param {Uint8Array} iv
* @param {Uint8Array} message
* @param {number} algo
* @returns {Uint8Array}
*/
  static encrypt(key: Uint8Array, iv: Uint8Array, message: Uint8Array, algo: number): Uint8Array;
/**
* @param {Uint8Array} key
* @param {Uint8Array} iv
* @param {Uint8Array} message
* @param {number} algo
* @returns {Uint8Array}
*/
  static decrypt(key: Uint8Array, iv: Uint8Array, message: Uint8Array, algo: number): Uint8Array;
}
/**
*/
export class BSM {
  free(): void;
/**
*
*     * Sign a message with the intention of verifying with this same Address.
*     * Used when using Bitcoin Signed Messages
*     *
*     * Returns boolean
*     
* @param {Uint8Array} message
* @param {Signature} signature
* @param {P2PKHAddress} address
* @returns {boolean}
*/
  static is_valid_message(message: Uint8Array, signature: Signature, address: P2PKHAddress): boolean;
/**
* @param {Uint8Array} message
* @param {Signature} signature
* @param {P2PKHAddress} address
* @returns {boolean}
*/
  static verify_message(message: Uint8Array, signature: Signature, address: P2PKHAddress): boolean;
/**
* @param {PrivateKey} priv_key
* @param {Uint8Array} message
* @returns {Signature}
*/
  static sign_message(priv_key: PrivateKey, message: Uint8Array): Signature;
/**
* @param {PrivateKey} priv_key
* @param {PrivateKey} ephemeral_key
* @param {Uint8Array} message
* @returns {Signature}
*/
  static sign_message_with_k(priv_key: PrivateKey, ephemeral_key: PrivateKey, message: Uint8Array): Signature;
}
/**
*/
export class ChainParams {
  free(): void;
/**
*/
  constructor();
/**
* @returns {ChainParams}
*/
  static mainnet(): ChainParams;
/**
* @returns {ChainParams}
*/
  static testnet(): ChainParams;
/**
* @returns {ChainParams}
*/
  static regtest(): ChainParams;
/**
* @returns {ChainParams}
*/
  static stn(): ChainParams;
}
/**
*/
export class CipherKeys {
  free(): void;
/**
* @returns {Uint8Array}
*/
  get_iv(): Uint8Array;
/**
* @returns {Uint8Array}
*/
  get_ke(): Uint8Array;
/**
* @returns {Uint8Array}
*/
  get_km(): Uint8Array;
}
/**
*/
export class ECDH {
  free(): void;
/**
* @param {PrivateKey} priv_key
* @param {PublicKey} pub_key
* @returns {Uint8Array}
*/
  static derive_shared_key(priv_key: PrivateKey, pub_key: PublicKey): Uint8Array;
}
/**
*/
export class ECDSA {
  free(): void;
/**
* @param {Signature} signature
* @param {PublicKey} public_key
* @param {PrivateKey} ephemeral_key
* @param {Uint8Array} preimage
* @param {number} hash_algo
* @returns {PrivateKey}
*/
  static private_key_from_signature_k(signature: Signature, public_key: PublicKey, ephemeral_key: PrivateKey, preimage: Uint8Array, hash_algo: number): PrivateKey;
/**
* @param {PrivateKey} private_key
* @param {Uint8Array} preimage
* @param {number} hash_algo
* @param {boolean} reverse_k
* @returns {Signature}
*/
  static sign_with_random_k(private_key: PrivateKey, preimage: Uint8Array, hash_algo: number, reverse_k: boolean): Signature;
/**
* @param {PrivateKey} private_key
* @param {Uint8Array} preimage
* @param {number} hash_algo
* @param {boolean} reverse_k
* @returns {Signature}
*/
  static sign_with_deterministic_k(private_key: PrivateKey, preimage: Uint8Array, hash_algo: number, reverse_k: boolean): Signature;
/**
* @param {PrivateKey} private_key
* @param {PrivateKey} ephemeral_key
* @param {Uint8Array} preimage
* @param {number} hash_algo
* @returns {Signature}
*/
  static sign_with_k(private_key: PrivateKey, ephemeral_key: PrivateKey, preimage: Uint8Array, hash_algo: number): Signature;
/**
* @param {Uint8Array} message
* @param {PublicKey} pub_key
* @param {Signature} signature
* @param {number} hash_algo
* @returns {boolean}
*/
  static verify_digest(message: Uint8Array, pub_key: PublicKey, signature: Signature, hash_algo: number): boolean;
}
/**
*/
export class ECIES {
  free(): void;
/**
* @param {Uint8Array} message
* @param {PrivateKey} sender_priv_key
* @param {PublicKey} recipient_pub_key
* @param {boolean} exclude_pub_key
* @returns {ECIESCiphertext}
*/
  static encrypt(message: Uint8Array, sender_priv_key: PrivateKey, recipient_pub_key: PublicKey, exclude_pub_key: boolean): ECIESCiphertext;
/**
*
*     * Encrypt with a randomly generate private key.
*     * This is intended to be used if you want to anonymously send a party an encrypted message.
*     
* @param {Uint8Array} message
* @param {PublicKey} recipient_pub_key
* @returns {ECIESCiphertext}
*/
  static encrypt_with_ephemeral_private_key(message: Uint8Array, recipient_pub_key: PublicKey): ECIESCiphertext;
/**
* @param {ECIESCiphertext} ciphertext
* @param {PrivateKey} recipient_priv_key
* @param {PublicKey} sender_pub_key
* @returns {Uint8Array}
*/
  static decrypt(ciphertext: ECIESCiphertext, recipient_priv_key: PrivateKey, sender_pub_key: PublicKey): Uint8Array;
/**
* @param {PrivateKey} priv_key
* @param {PublicKey} pub_key
* @returns {CipherKeys}
*/
  static derive_cipher_keys(priv_key: PrivateKey, pub_key: PublicKey): CipherKeys;
}
/**
*/
export class ECIESCiphertext {
  free(): void;
/**
* @returns {Uint8Array}
*/
  get_ciphertext(): Uint8Array;
/**
* @returns {Uint8Array}
*/
  get_hmac(): Uint8Array;
/**
* @returns {CipherKeys | undefined}
*/
  get_cipher_keys(): CipherKeys | undefined;
/**
* @returns {Uint8Array}
*/
  to_bytes(): Uint8Array;
/**
* @returns {PublicKey}
*/
  extract_public_key(): PublicKey;
/**
* @param {Uint8Array} buffer
* @param {boolean} has_pub_key
* @returns {ECIESCiphertext}
*/
  static from_bytes(buffer: Uint8Array, has_pub_key: boolean): ECIESCiphertext;
}
/**
*/
export class ExtendedPrivateKey {
  free(): void;
/**
* @returns {PrivateKey}
*/
  get_private_key(): PrivateKey;
/**
* @returns {PublicKey}
*/
  get_public_key(): PublicKey;
/**
* @returns {Uint8Array}
*/
  get_chain_code(): Uint8Array;
/**
* @returns {number}
*/
  get_depth(): number;
/**
* @returns {Uint8Array}
*/
  get_parent_fingerprint(): Uint8Array;
/**
* @returns {number}
*/
  get_index(): number;
/**
* @param {number} index
* @returns {ExtendedPrivateKey}
*/
  derive(index: number): ExtendedPrivateKey;
/**
* @param {string} path
* @returns {ExtendedPrivateKey}
*/
  derive_from_path(path: string): ExtendedPrivateKey;
/**
* @param {Uint8Array} seed
* @returns {ExtendedPrivateKey}
*/
  static from_seed(seed: Uint8Array): ExtendedPrivateKey;
/**
* @returns {ExtendedPrivateKey}
*/
  static from_random(): ExtendedPrivateKey;
/**
* @param {string} xprv_string
* @returns {ExtendedPrivateKey}
*/
  static from_string(xprv_string: string): ExtendedPrivateKey;
/**
* @returns {string}
*/
  to_string(): string;
/**
* @param {Uint8Array} mnemonic
* @param {Uint8Array | undefined} passphrase
* @returns {ExtendedPrivateKey}
*/
  static from_mnemonic(mnemonic: Uint8Array, passphrase?: Uint8Array): ExtendedPrivateKey;
}
/**
*/
export class ExtendedPublicKey {
  free(): void;
/**
* @returns {PublicKey}
*/
  get_public_key(): PublicKey;
/**
* @param {ExtendedPrivateKey} xpriv
* @returns {ExtendedPublicKey}
*/
  static from_xpriv(xpriv: ExtendedPrivateKey): ExtendedPublicKey;
/**
* @returns {Uint8Array}
*/
  get_chain_code(): Uint8Array;
/**
* @returns {number}
*/
  get_depth(): number;
/**
* @returns {Uint8Array}
*/
  get_parent_fingerprint(): Uint8Array;
/**
* @returns {number}
*/
  get_index(): number;
/**
* @param {number} index
* @returns {ExtendedPublicKey}
*/
  derive(index: number): ExtendedPublicKey;
/**
* @param {string} path
* @returns {ExtendedPublicKey}
*/
  derive_from_path(path: string): ExtendedPublicKey;
/**
* @param {Uint8Array} seed
* @returns {ExtendedPublicKey}
*/
  static from_seed(seed: Uint8Array): ExtendedPublicKey;
/**
* @returns {ExtendedPublicKey}
*/
  static from_random(): ExtendedPublicKey;
/**
* @param {string} xpub_string
* @returns {ExtendedPublicKey}
*/
  static from_string(xpub_string: string): ExtendedPublicKey;
/**
* @returns {string}
*/
  to_string(): string;
}
/**
*/
export class Hash {
  free(): void;
/**
* @returns {Uint8Array}
*/
  to_bytes(): Uint8Array;
/**
* @returns {string}
*/
  to_hex(): string;
/**
* @param {Uint8Array} input
* @returns {Hash}
*/
  static sha_256d(input: Uint8Array): Hash;
/**
* @param {Uint8Array} input
* @returns {Hash}
*/
  static sha_256(input: Uint8Array): Hash;
/**
* @param {Uint8Array} input
* @returns {Hash}
*/
  static sha_1(input: Uint8Array): Hash;
/**
* @param {Uint8Array} input
* @returns {Hash}
*/
  static ripemd_160(input: Uint8Array): Hash;
/**
* @param {Uint8Array} input
* @returns {Hash}
*/
  static hash_160(input: Uint8Array): Hash;
/**
* @param {Uint8Array} input
* @returns {Hash}
*/
  static sha_512(input: Uint8Array): Hash;
/**
* @param {Uint8Array} input
* @param {Uint8Array} key
* @returns {Hash}
*/
  static sha_512_hmac(input: Uint8Array, key: Uint8Array): Hash;
/**
* @param {Uint8Array} input
* @param {Uint8Array} key
* @returns {Hash}
*/
  static sha_256_hmac(input: Uint8Array, key: Uint8Array): Hash;
/**
* @param {Uint8Array} input
* @param {Uint8Array} key
* @returns {Hash}
*/
  static sha_256d_hmac(input: Uint8Array, key: Uint8Array): Hash;
/**
* @param {Uint8Array} input
* @param {Uint8Array} key
* @returns {Hash}
*/
  static sha_1_hmac(input: Uint8Array, key: Uint8Array): Hash;
/**
* @param {Uint8Array} input
* @param {Uint8Array} key
* @returns {Hash}
*/
  static ripemd_160_hmac(input: Uint8Array, key: Uint8Array): Hash;
/**
* @param {Uint8Array} input
* @param {Uint8Array} key
* @returns {Hash}
*/
  static hash_160_hmac(input: Uint8Array, key: Uint8Array): Hash;
}
/**
*/
export class Interpreter {
  free(): void;
/**
* @param {Transaction} tx
* @param {number} txin_idx
* @returns {Interpreter}
*/
  static from_transaction(tx: Transaction, txin_idx: number): Interpreter;
/**
* @param {Script} script
* @returns {Interpreter}
*/
  static from_script(script: Script): Interpreter;
/**
*/
  run(): void;
/**
* @returns {State | undefined}
*/
  next(): State | undefined;
/**
* @returns {State}
*/
  get_state(): State;
}
/**
*/
export class KDF {
  free(): void;
/**
* @returns {Hash}
*/
  get_hash(): Hash;
/**
* @returns {Uint8Array}
*/
  get_salt(): Uint8Array;
/**
*
*     * Implementation of PBKDF2 - when None is specified for salt, a random salt will be generated
*     
* @param {Uint8Array} password
* @param {Uint8Array | undefined} salt
* @param {number} hash_algo
* @param {number} rounds
* @param {number} output_length
* @returns {KDF}
*/
  static pbkdf2(password: Uint8Array, salt: Uint8Array | undefined, hash_algo: number, rounds: number, output_length: number): KDF;
}
/**
*/
export class P2PKHAddress {
  free(): void;
/**
* @param {Uint8Array} hash_bytes
* @returns {P2PKHAddress}
*/
  static from_pubkey_hash(hash_bytes: Uint8Array): P2PKHAddress;
/**
* @param {PublicKey} pub_key
* @returns {P2PKHAddress}
*/
  static from_pubkey(pub_key: PublicKey): P2PKHAddress;
/**
* @param {ChainParams} chain_params
* @returns {P2PKHAddress}
*/
  set_chain_params(chain_params: ChainParams): P2PKHAddress;
/**
* @returns {string}
*/
  to_string(): string;
/**
* @param {string} address_string
* @returns {P2PKHAddress}
*/
  static from_string(address_string: string): P2PKHAddress;
/**
* @returns {Script}
*/
  get_locking_script(): Script;
/**
* @param {PublicKey} pub_key
* @param {SighashSignature} sig
* @returns {Script}
*/
  get_unlocking_script(pub_key: PublicKey, sig: SighashSignature): Script;
/**
* @param {Uint8Array} message
* @param {Signature} signature
* @returns {boolean}
*/
  verify_bitcoin_message(message: Uint8Array, signature: Signature): boolean;
}
/**
*/
export class PrivateKey {
  free(): void;
/**
* @returns {Uint8Array}
*/
  to_bytes(): Uint8Array;
/**
* @returns {string}
*/
  to_hex(): string;
/**
* @returns {PrivateKey}
*/
  static from_random(): PrivateKey;
/**
* @returns {Uint8Array}
*/
  get_point(): Uint8Array;
/**
* @param {boolean} should_compress
* @returns {PrivateKey}
*/
  compress_public_key(should_compress: boolean): PrivateKey;
/**
* @param {string} wif_string
* @returns {PrivateKey}
*/
  static from_wif(wif_string: string): PrivateKey;
/**
* @param {string} hex_str
* @returns {PrivateKey}
*/
  static from_hex(hex_str: string): PrivateKey;
/**
*
*     * Standard ECDSA Message Signing using SHA256 as the digestg
*     
* @param {Uint8Array} msg
* @returns {Signature}
*/
  sign_message(msg: Uint8Array): Signature;
/**
* @returns {string}
*/
  to_wif(): string;
/**
* @param {Uint8Array} bytes
* @returns {PrivateKey}
*/
  static from_bytes(bytes: Uint8Array): PrivateKey;
/**
* @returns {PublicKey}
*/
  to_public_key(): PublicKey;
/**
*
*     * Encrypt a message to the public key of this private key.
*     
* @param {Uint8Array} message
* @returns {ECIESCiphertext}
*/
  encrypt_message(message: Uint8Array): ECIESCiphertext;
/**
*
*     * Decrypt a message that was sent to the public key corresponding to this private key.
*     
* @param {ECIESCiphertext} ciphertext
* @param {PublicKey} sender_pub_key
* @returns {Uint8Array}
*/
  decrypt_message(ciphertext: ECIESCiphertext, sender_pub_key: PublicKey): Uint8Array;
}
/**
*/
export class PublicKey {
  free(): void;
/**
* @returns {P2PKHAddress}
*/
  to_address(): P2PKHAddress;
/**
* @param {string} hex_str
* @returns {PublicKey}
*/
  static from_hex(hex_str: string): PublicKey;
/**
* @param {Uint8Array} bytes
* @returns {PublicKey}
*/
  static from_bytes(bytes: Uint8Array): PublicKey;
/**
* @returns {Uint8Array}
*/
  to_bytes(): Uint8Array;
/**
* @returns {string}
*/
  to_hex(): string;
/**
* @param {PrivateKey} priv_key
* @returns {PublicKey}
*/
  static from_private_key(priv_key: PrivateKey): PublicKey;
/**
* @param {Uint8Array} message
* @param {Signature} signature
* @returns {boolean}
*/
  verify_message(message: Uint8Array, signature: Signature): boolean;
/**
* @returns {P2PKHAddress}
*/
  to_p2pkh_address(): P2PKHAddress;
/**
* @returns {PublicKey}
*/
  to_compressed(): PublicKey;
/**
* @returns {PublicKey}
*/
  to_decompressed(): PublicKey;
/**
* @param {Uint8Array} message
* @param {PrivateKey} sender_private_key
* @returns {ECIESCiphertext}
*/
  encrypt_message(message: Uint8Array, sender_private_key: PrivateKey): ECIESCiphertext;
/**
* @param {Uint8Array} message
* @param {Signature} signature
* @returns {boolean}
*/
  is_valid_message(message: Uint8Array, signature: Signature): boolean;
/**
* @returns {boolean}
*/
  is_compressed(): boolean;
}
/**
*/
export class RecoveryInfo {
  free(): void;
/**
* @param {boolean} is_y_odd
* @param {boolean} is_x_reduced
* @param {boolean} is_pubkey_compressed
*/
  constructor(is_y_odd: boolean, is_x_reduced: boolean, is_pubkey_compressed: boolean);
/**
* @param {number} recovery_byte
* @param {boolean} is_pubkey_compressed
* @returns {RecoveryInfo}
*/
  static from_byte(recovery_byte: number, is_pubkey_compressed: boolean): RecoveryInfo;
}
/**
*/
export class Script {
  free(): void;
/**
* @returns {string}
*/
  to_asm_string(): string;
/**
* @returns {string}
*/
  to_extended_asm_string(): string;
/**
* @param {string} hex
* @returns {Script}
*/
  static from_hex(hex: string): Script;
/**
* @param {Uint8Array} bytes
* @returns {Script}
*/
  static from_bytes(bytes: Uint8Array): Script;
/**
* @param {string} asm_string
* @returns {Script}
*/
  static from_asm_string(asm_string: string): Script;
/**
* @param {Uint8Array} data_bytes
* @returns {Uint8Array}
*/
  static encode_pushdata(data_bytes: Uint8Array): Uint8Array;
/**
*
*     * Gets the OP_PUSHDATA prefix varint
*     
* @param {number} length
* @returns {Uint8Array}
*/
  static get_pushdata_bytes(length: number): Uint8Array;
/**
* @returns {any}
*/
  to_script_bits(): any;
/**
* @returns {Uint8Array}
*/
  to_bytes(): Uint8Array;
/**
* @returns {number}
*/
  get_script_length(): number;
/**
* @returns {string}
*/
  to_hex(): string;
/**
*/
  remove_codeseparators(): void;
}
/**
*/
export class SighashSignature {
  free(): void;
/**
* @param {Signature} signature
* @param {number} sighash_type
* @param {Uint8Array} sighash_buffer
*/
  constructor(signature: Signature, sighash_type: number, sighash_buffer: Uint8Array);
/**
* @returns {string}
*/
  to_hex(): string;
/**
* @returns {Uint8Array}
*/
  to_bytes(): Uint8Array;
/**
* @param {Uint8Array} bytes
* @param {Uint8Array} sighash_buffer
* @returns {SighashSignature}
*/
  static from_bytes(bytes: Uint8Array, sighash_buffer: Uint8Array): SighashSignature;
}
/**
*/
export class Signature {
  free(): void;
/**
* @param {Uint8Array} bytes
* @returns {Signature}
*/
  static from_der(bytes: Uint8Array): Signature;
/**
* @param {string} hex
* @returns {Signature}
*/
  static from_hex_der(hex: string): Signature;
/**
* @param {Uint8Array} compact_bytes
* @returns {Signature}
*/
  static from_compact_bytes(compact_bytes: Uint8Array): Signature;
/**
* @param {Uint8Array} message
* @param {number} hash_algo
* @returns {PublicKey}
*/
  recover_public_key(message: Uint8Array, hash_algo: number): PublicKey;
/**
* @returns {string}
*/
  to_der_hex(): string;
/**
* @returns {Uint8Array}
*/
  to_der_bytes(): Uint8Array;
/**
* @param {RecoveryInfo | undefined} recovery_info
* @returns {Uint8Array}
*/
  to_compact_bytes(recovery_info?: RecoveryInfo): Uint8Array;
/**
* @returns {Uint8Array}
*/
  r(): Uint8Array;
/**
* @returns {string}
*/
  r_hex(): string;
/**
* @returns {Uint8Array}
*/
  s(): Uint8Array;
/**
* @returns {string}
*/
  s_hex(): string;
/**
* @param {RecoveryInfo | undefined} recovery_info
* @returns {string}
*/
  to_compact_hex(recovery_info?: RecoveryInfo): string;
/**
* @param {Uint8Array} message
* @param {PublicKey} pub_key
* @returns {boolean}
*/
  verify_message(message: Uint8Array, pub_key: PublicKey): boolean;
}
/**
*/
export class State {
  free(): void;
/**
* @returns {Script}
*/
  get_executed_script(): Script;
/**
* @returns {any}
*/
  get_stack(): any;
/**
* @returns {any}
*/
  get_alt_stack(): any;
/**
* @returns {number}
*/
  get_status(): number;
}
/**
*/
export class Transaction {
  free(): void;
/**
* @returns {number}
*/
  get_version(): number;
/**
* @returns {number}
*/
  get_ninputs(): number;
/**
* @returns {number}
*/
  get_noutputs(): number;
/**
* @param {number} index
* @returns {TxIn | undefined}
*/
  get_input(index: number): TxIn | undefined;
/**
* @param {number} index
* @returns {TxOut | undefined}
*/
  get_output(index: number): TxOut | undefined;
/**
* @returns {number}
*/
  get_n_locktime(): number;
/**
* @returns {Uint8Array}
*/
  get_n_locktime_as_bytes(): Uint8Array;
/**
*
*     * Creates a new empty transaction where you need to add inputs and outputs
*     * Transaction.add_input(TxIn) and Transaction.add_output(TxOut)
*     
* @param {number} version
* @param {number} n_locktime
*/
  constructor(version: number, n_locktime: number);
/**
* @param {number} version
* @returns {Transaction}
*/
  set_version(version: number): Transaction;
/**
* @param {number} n_locktime
* @returns {Transaction}
*/
  set_nlocktime(n_locktime: number): Transaction;
/**
* @param {TxIn} input
*/
  add_input(input: TxIn): void;
/**
* @param {TxIn} input
*/
  prepend_input(input: TxIn): void;
/**
* @param {number} index
* @param {TxIn} input
*/
  insert_input(index: number, input: TxIn): void;
/**
* @param {TxOut} output
*/
  add_output(output: TxOut): void;
/**
* @param {TxOut} output
*/
  prepend_output(output: TxOut): void;
/**
* @param {number} index
* @param {TxOut} output
*/
  insert_output(index: number, output: TxOut): void;
/**
* @param {number} index
* @param {TxIn} input
*/
  set_input(index: number, input: TxIn): void;
/**
* @param {number} index
* @param {TxOut} output
*/
  set_output(index: number, output: TxOut): void;
/**
* @returns {boolean}
*/
  is_coinbase_impl(): boolean;
/**
*
*     * XT Method:
*     * Returns the combined sum of all input satoshis.
*     * If any of the inputs dont have satoshis defined, this returns None or null
*     
* @returns {bigint | undefined}
*/
  satoshis_in(): bigint | undefined;
/**
*
*     * Returns the combined sum of all output satoshis.
*     
* @returns {bigint}
*/
  satoshis_out(): bigint;
/**
* @param {string} hex_str
* @returns {Transaction}
*/
  static from_hex(hex_str: string): Transaction;
/**
* @param {Uint8Array} tx_bytes
* @returns {Transaction}
*/
  static from_bytes(tx_bytes: Uint8Array): Transaction;
/**
* @returns {string}
*/
  to_json_string(): string;
/**
* @param {string} json_string
* @returns {Transaction}
*/
  static from_json_string(json_string: string): Transaction;
/**
* @returns {any}
*/
  to_json(): any;
/**
* @returns {Uint8Array}
*/
  to_bytes(): Uint8Array;
/**
* @returns {string}
*/
  to_hex(): string;
/**
*
*     * Get size of current serialised Transaction object
*     
* @returns {number}
*/
  get_size(): number;
/**
*
*     * Adds an array of TxIn's to the transaction
*     * @param {TxIn[]} tx_ins
*     
* @param {any[]} tx_ins
*/
  add_inputs(tx_ins: any[]): void;
/**
*
*     * Returns all outpoints from this transaction as a 2D array of 36 byte buffers.
*     *
*     * @returns {Uint8Array[]} outpoint_array
*     
* @returns {any}
*/
  get_outpoints(): any;
/**
*
*     * Adds an array of TxOuts to the transaction
*     * @param {TxOut[]} tx_outs
*     
* @param {any[]} tx_outs
*/
  add_outputs(tx_outs: any[]): void;
/**
*
*     * Gets the ID of the current transaction as a hex string.
*     
* @returns {string}
*/
  get_id_hex(): string;
/**
*
*     * Gets the ID of the current transaction as a Uint8Array.
*     
* @returns {Uint8Array}
*/
  get_id_bytes(): Uint8Array;
/**
*
*     * Serialises this entire transaction to CBOR, preserving all fields from the standard Transaction format + TX+
*     
* @returns {Uint8Array}
*/
  to_compact_bytes(): Uint8Array;
/**
* @returns {string}
*/
  to_compact_hex(): string;
/**
*
*     * Deserialises the provided CBOR buffer to the TX+ format
*     
* @param {Uint8Array} compact_buffer
* @returns {Transaction}
*/
  static from_compact_bytes(compact_buffer: Uint8Array): Transaction;
/**
*
*     * Deserialises the provided CBOR buffer to the TX+ format
*     
* @param {string} compact_hex
* @returns {Transaction}
*/
  static from_compact_hex(compact_hex: string): Transaction;
/**
* @returns {boolean}
*/
  is_coinbase(): boolean;
/**
* @param {PrivateKey} priv_key
* @param {number} sighash
* @param {number} n_tx_in
* @param {Script} unsigned_script
* @param {bigint} value
* @returns {SighashSignature}
*/
  sign(priv_key: PrivateKey, sighash: number, n_tx_in: number, unsigned_script: Script, value: bigint): SighashSignature;
/**
* @param {PrivateKey} priv_key
* @param {PrivateKey} ephemeral_key
* @param {number} sighash
* @param {number} n_tx_in
* @param {Script} unsigned_script
* @param {bigint} value
* @returns {SighashSignature}
*/
  sign_with_k(priv_key: PrivateKey, ephemeral_key: PrivateKey, sighash: number, n_tx_in: number, unsigned_script: Script, value: bigint): SighashSignature;
/**
* @param {number} sighash
* @param {number} n_tx_in
* @param {Script} unsigned_script
* @param {bigint} value
* @returns {Uint8Array}
*/
  sighash_preimage(sighash: number, n_tx_in: number, unsigned_script: Script, value: bigint): Uint8Array;
/**
* @param {PublicKey} pub_key
* @param {SighashSignature} sig
* @returns {boolean}
*/
  verify(pub_key: PublicKey, sig: SighashSignature): boolean;
}
/**
*/
export class TxIn {
  free(): void;
/**
* @param {Uint8Array} prev_tx_id
* @param {number} vout
* @param {Script} unlocking_script
* @param {number | undefined} sequence
*/
  constructor(prev_tx_id: Uint8Array, vout: number, unlocking_script: Script, sequence?: number);
/**
* @returns {TxIn}
*/
  static empty(): TxIn;
/**
* @param {boolean | undefined} little_endian
* @returns {Uint8Array}
*/
  get_prev_tx_id(little_endian?: boolean): Uint8Array;
/**
* @param {boolean | undefined} little_endian
* @returns {string}
*/
  get_prev_tx_id_hex(little_endian?: boolean): string;
/**
* @returns {number}
*/
  get_vout(): number;
/**
* @returns {bigint}
*/
  get_unlocking_script_size(): bigint;
/**
* @returns {Script}
*/
  get_unlocking_script(): Script;
/**
* @returns {string}
*/
  get_unlocking_script_hex(): string;
/**
* @returns {number}
*/
  get_sequence(): number;
/**
* @returns {Uint8Array}
*/
  get_sequence_as_bytes(): Uint8Array;
/**
* @param {boolean | undefined} little_endian
* @returns {Uint8Array}
*/
  get_outpoint_bytes(little_endian?: boolean): Uint8Array;
/**
* @param {boolean | undefined} little_endian
* @returns {string}
*/
  get_outpoint_hex(little_endian?: boolean): string;
/**
* @param {Script} script
*/
  set_unlocking_script(script: Script): void;
/**
* @param {Uint8Array} txid
*/
  set_prev_tx_id(txid: Uint8Array): void;
/**
* @param {number} vout
*/
  set_vout(vout: number): void;
/**
* @param {number} sequence
*/
  set_sequence(sequence: number): void;
/**
* @param {bigint} satoshis
*/
  set_satoshis(satoshis: bigint): void;
/**
* @returns {bigint | undefined}
*/
  get_satoshis(): bigint | undefined;
/**
* @param {Script} locking_script
*/
  set_locking_script(locking_script: Script): void;
/**
* @returns {Script | undefined}
*/
  get_locking_script(): Script | undefined;
/**
* @returns {Uint8Array | undefined}
*/
  get_locking_script_bytes(): Uint8Array | undefined;
/**
* @param {string} hex_str
* @returns {TxIn}
*/
  static from_hex(hex_str: string): TxIn;
/**
* @returns {any}
*/
  to_json(): any;
/**
* @returns {string}
*/
  to_json_string(): string;
/**
* @returns {Uint8Array}
*/
  to_bytes(): Uint8Array;
/**
* @returns {string}
*/
  to_hex(): string;
/**
* @param {Uint8Array} outpoint
* @returns {TxIn}
*/
  static from_outpoint_bytes(outpoint: Uint8Array): TxIn;
/**
*
*     * Serialises this entire transaction to CBOR, preserving all fields from the standard Transaction format + TX+
*     
* @returns {Uint8Array}
*/
  to_compact_bytes(): Uint8Array;
/**
* @returns {string}
*/
  to_compact_hex(): string;
/**
*
*     * Deserialises the provided CBOR buffer to the TX+ format
*     
* @param {Uint8Array} compact_buffer
* @returns {TxIn}
*/
  static from_compact_bytes(compact_buffer: Uint8Array): TxIn;
/**
*
*     * Deserialises the provided CBOR buffer to the TX+ format
*     
* @param {string} compact_hex
* @returns {TxIn}
*/
  static from_compact_hex(compact_hex: string): TxIn;
/**
* Concatenates ScriptSig and UnlockingScript into a single script.
* @returns {Script}
*/
  get_finalised_script(): Script;
/**
* @returns {boolean}
*/
  is_coinbase(): boolean;
}
/**
*/
export class TxOut {
  free(): void;
/**
* @param {bigint} value
* @param {Script} script_pub_key
*/
  constructor(value: bigint, script_pub_key: Script);
/**
* @returns {bigint}
*/
  get_satoshis(): bigint;
/**
* @returns {Uint8Array}
*/
  get_satoshis_as_bytes(): Uint8Array;
/**
* @returns {number}
*/
  get_script_pub_key_size(): number;
/**
* @returns {Script}
*/
  get_script_pub_key(): Script;
/**
* @returns {string}
*/
  get_script_pub_key_hex(): string;
/**
* @param {string} hex_str
* @returns {TxOut}
*/
  static from_hex(hex_str: string): TxOut;
/**
* @returns {Uint8Array}
*/
  to_bytes(): Uint8Array;
/**
* @returns {string}
*/
  to_hex(): string;
/**
* @returns {any}
*/
  to_json(): any;
/**
* @returns {string}
*/
  to_json_string(): string;
}
