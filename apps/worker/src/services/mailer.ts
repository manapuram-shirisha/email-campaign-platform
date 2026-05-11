import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env } from "../config/env.js";

const ses = new SESv2Client({
  region: env.AWS_REGION
});

type SendWorkerEmailInput = {
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  replyToEmail?: string | null;
  unsubscribeUrl?: string;
};

export async function sendWorkerEmail(input: SendWorkerEmailInput) {
  if (env.EMAIL_PROVIDER === "dev") {
    return {
      provider: "dev",
      messageId: `dev-${Date.now()}`
    };
  }

  const result = await ses.send(
    new SendEmailCommand({
      FromEmailAddress: input.fromEmail,
      Destination: {
        ToAddresses: [input.to]
      },
      ReplyToAddresses: input.replyToEmail ? [input.replyToEmail] : undefined,
      ConfigurationSetName: env.SES_CONFIGURATION_SET,
      Content: {
        Simple: {
          Headers: input.unsubscribeUrl
            ? [
                {
                  Name: "List-Unsubscribe",
                  Value: `<${input.unsubscribeUrl}>`
                },
                {
                  Name: "List-Unsubscribe-Post",
                  Value: "List-Unsubscribe=One-Click"
                }
              ]
            : undefined,
          Subject: {
            Data: input.subject,
            Charset: "UTF-8"
          },
          Body: {
            Html: {
              Data: input.html,
              Charset: "UTF-8"
            }
          }
        }
      }
    })
  );

  return {
    provider: "ses",
    messageId: result.MessageId ?? null
  };
}
