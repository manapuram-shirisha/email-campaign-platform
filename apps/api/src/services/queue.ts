import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { env } from "../config/env.js";

const sqs = new SQSClient({
  region: env.AWS_REGION
});

export async function enqueueSendJob(payload: unknown) {
  if (!env.SQS_SEND_QUEUE_URL) {
    console.log("[DEV QUEUE] send job");
    console.log(JSON.stringify(payload, null, 2));

    return {
      provider: "dev",
      messageId: `dev-queue-${Date.now()}`
    };
  }

  if (env.EMAIL_PROVIDER === "dev") {
    console.log("[DEV QUEUE] send job");
    console.log(JSON.stringify(payload, null, 2));

    return {
      provider: "dev",
      messageId: `dev-queue-${Date.now()}`
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
