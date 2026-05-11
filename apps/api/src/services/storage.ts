import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

const s3 = new S3Client({
  region: env.AWS_REGION
});

type UploadAssetInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export async function uploadAsset(input: UploadAssetInput) {
  if (!env.S3_BUCKET) {
    throw new Error("S3_BUCKET is not configured.");
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType
    })
  );

  return {
    bucket: env.S3_BUCKET,
    key: input.key,
    url: `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${input.key}`
  };
}
