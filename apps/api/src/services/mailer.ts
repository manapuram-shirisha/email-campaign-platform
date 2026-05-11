import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env } from "../config/env.js";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  unsubscribeUrl?: string;
};

const ses = new SESv2Client({
  region: env.AWS_REGION
});

export async function sendEmail(input: SendEmailInput) {
  const fromEmail = input.from ?? env.SES_FROM_EMAIL;

  if (env.EMAIL_PROVIDER === "dev") {
    console.log("[DEV EMAIL]");
    console.log("To:", input.to);
    console.log("Subject:", input.subject);
    console.log("From:", fromEmail);
    console.log("Reply-To:", input.replyTo ?? "-");
    console.log("Unsubscribe:", input.unsubscribeUrl ?? "-");
    console.log("HTML:", input.html.slice(0, 300));

    return {
      provider: "dev",
      messageId: `dev-${Date.now()}`
    };
  }

  const headers = input.unsubscribeUrl
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
    : undefined;

  const result = await ses.send(
    new SendEmailCommand({
      FromEmailAddress: fromEmail,
      Destination: {
        ToAddresses: [input.to]
      },
      ReplyToAddresses: input.replyTo ? [input.replyTo] : undefined,
      ConfigurationSetName: env.SES_CONFIGURATION_SET,
      Content: {
        Simple: {
          Subject: {
            Data: input.subject,
            Charset: "UTF-8"
          },
          Body: {
            Html: {
              Data: input.html,
              Charset: "UTF-8"
            },
            Text: input.text
              ? {
                  Data: input.text,
                  Charset: "UTF-8"
                }
              : undefined
          },
          Headers: headers
        }
      }
    })
  );

  return {
    provider: "ses",
    messageId: result.MessageId
  };
}
