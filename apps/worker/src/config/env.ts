import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  AWS_REGION: z.string().default("ap-south-2"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SES_CONFIGURATION_SET: z.string().default("email-platform-events"),
  SES_FROM_EMAIL: z.string().email(),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  SQS_SEND_QUEUE_URL: z.string().optional(),
  SQS_EVENTS_QUEUE_URL: z.string().optional(),
  WORKER_MAX_RECEIVE_COUNT: z.coerce.number().default(5),
  EMAIL_PROVIDER: z.enum(["dev", "ses"]).default("dev")
}).superRefine((value, ctx) => {
  if (value.EMAIL_PROVIDER !== "ses") return;

  const requiredForSes = [
    ["AWS_ACCESS_KEY_ID", value.AWS_ACCESS_KEY_ID],
    ["AWS_SECRET_ACCESS_KEY", value.AWS_SECRET_ACCESS_KEY],
    ["SQS_SEND_QUEUE_URL", value.SQS_SEND_QUEUE_URL]
  ] as const;

  for (const [name, setting] of requiredForSes) {
    if (!setting) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [name],
        message: `${name} is required when EMAIL_PROVIDER=ses`
      });
    }
  }
});

export const env = envSchema.parse(process.env);
