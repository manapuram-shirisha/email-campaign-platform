import {
  SendMessageCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient
} from "@aws-sdk/client-sqs";
import { env } from "../config/env.js";

const sqs = new SQSClient({
  region: env.AWS_REGION
});

export async function receiveSendJobs() {
  if (!env.SQS_SEND_QUEUE_URL || env.EMAIL_PROVIDER === "dev") {
    console.log("[DEV WORKER] no real SQS polling in dev mode");
    return [];
  }

  const result = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: env.SQS_SEND_QUEUE_URL,
      MaxNumberOfMessages: 5,
      WaitTimeSeconds: 5,
      MessageSystemAttributeNames: ["ApproximateReceiveCount"]
    })
  );

  return result.Messages ?? [];
}

export async function deleteSendJob(receiptHandle: string) {
  if (!env.SQS_SEND_QUEUE_URL || env.EMAIL_PROVIDER === "dev") {
    return;
  }

  await sqs.send(
    new DeleteMessageCommand({
      QueueUrl: env.SQS_SEND_QUEUE_URL,
      ReceiptHandle: receiptHandle
    })
  );
}

export async function enqueueSendJob(payload: unknown) {
  if (!env.SQS_SEND_QUEUE_URL || env.EMAIL_PROVIDER === "dev") {
    console.log("[DEV WORKER QUEUE] send job");
    console.log(JSON.stringify(payload, null, 2));
    return {
      provider: "dev",
      messageId: `dev-worker-queue-${Date.now()}`
    };
  }

  const result = await sqs.send(
    new SendMessageCommand({
      QueueUrl: env.SQS_SEND_QUEUE_URL,
      MessageBody: JSON.stringify(payload)
    })
  );

  return {
    provider: "sqs",
    messageId: result.MessageId
  };
}
