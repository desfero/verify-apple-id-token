import * as jwt from "jsonwebtoken";
import * as jwksClient from "jwks-rsa";
import { VerifyAppleIdTokenParams, VerifyAppleIdTokenResponse } from "./types";

export const APPLE_BASE_URL = "https://appleid.apple.com";
export const JWKS_APPLE_URI = "/auth/keys";

export const getAppleJWK = async (kid: string) => {
  const client = jwksClient({
    cache: true,
    jwksUri: `${APPLE_BASE_URL}${JWKS_APPLE_URI}`,
  });
  const key = await new Promise<jwksClient.SigningKey>((resolve, reject) => {
    client.getSigningKey(kid, (error, result) => {
      if (error) {
        return reject(error);
      }
      return resolve(result);
    });
  });
  return {
    publicKey: key.getPublicKey(),
    kid: key.kid,
    alg: key.alg,
  };
};

export const getApplePublicKey = async (kid: string) => {
  const jwk = await getAppleJWK(kid);

  return jwk.publicKey;
};

export const verifyToken = async (params: VerifyAppleIdTokenParams) => {
  const decoded = jwt.decode(params.idToken, { complete: true });
  const { kid, alg: jwtAlg } = decoded.header;

  const { publicKey, alg: jwkAlg } = await getAppleJWK(kid);

  if (jwtAlg !== jwkAlg) {
    throw new Error(`The alg does not match the jwk configuration - alg: ${jwtAlg} | expected: ${jwkAlg}`);
  }

  const jwtClaims = jwt.verify(params.idToken, publicKey, {
    algorithms: [jwkAlg as jwt.Algorithm],
    nonce: params.nonce,
  }) as VerifyAppleIdTokenResponse;

  if (jwtClaims?.iss !== APPLE_BASE_URL) {
    throw new Error(`The iss does not match the Apple URL - iss: ${jwtClaims.iss} | expected: ${APPLE_BASE_URL}`);
  }

  const isFounded = [].concat(jwtClaims.aud).some((aud) => [].concat(params.clientId).includes(aud));

  if (isFounded) {
    ["email_verified", "is_private_email"].forEach((field) => {
      if (jwtClaims[field] !== undefined) {
        jwtClaims[field] = Boolean(jwtClaims[field]);
      }
    });

    return jwtClaims;
  }

  throw new Error(`The aud parameter does not include this client - is: ${jwtClaims.aud} | expected: ${params.clientId}`);
};
