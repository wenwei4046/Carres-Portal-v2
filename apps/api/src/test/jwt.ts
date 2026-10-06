import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { _setJwksForTesting } from "../middleware/auth";

// The one ES256 keypair the API tests sign with. The private key signs test
// tokens; the public key is what the auth middleware checks them against.
// Each test file gets its own copy of this module, so its own keypair.
const KID = "test-kid";
const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
const publicJwk = { ...(await exportJWK(publicKey)), kid: KID, alg: "ES256", use: "sig" };

/** Make the auth middleware accept tokens from signTestJwt. */
export function useTestJwks(): void {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
}

/** A signed test token for user `sub` with the given claims. Expires in 5 minutes. */
export function signTestJwt(sub: string, claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}
