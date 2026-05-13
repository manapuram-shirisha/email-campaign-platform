import "dotenv/config";
import express from "express";
import cors from "cors";
import { sendEmail } from "./services/mailer.js";
import { enqueueSendJob } from "./services/queue.js";
import { uploadAsset } from "./services/storage.js";
import { prisma } from "./lib/prisma.js";
import { authRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";
import { usersRouter } from "./routes/users.js";
import { listsRouter } from "./routes/lists.js";
import { contactsRouter } from "./routes/contacts.js";
import { segmentsRouter } from "./routes/segments.js";
import { templatesRouter } from "./routes/templates.js";
import { campaignRouter } from "./routes/campaign.js";
import { publicRouter } from "./routes/public.js";
import { suppressionRouter } from "./routes/suppression.js";
import { analyticsRouter } from "./routes/analytics.js";
import { organisationRouter } from "./routes/organisation.js";


const app = express();

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

app.use(cors({
  origin: webOrigin,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/users", usersRouter);
app.use("/api/lists", listsRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/segments", segmentsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/campaigns", campaignRouter);
app.use("/api/settings/suppression", suppressionRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/settings/org", organisationRouter);
app.use("/", publicRouter);

app.get("/", (_req, res) => {
  res.json({
    message: "Email Campaign Platform API",
    health: "/health"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "api"
  });
});

app.post("/dev/test-email", async (_req, res) => {
  const result = await sendEmail({
    to: "test@example.com",
    subject: "Dev email test",
    html: "<h1>Hello from dev mailer</h1>",
    unsubscribeUrl: "http://localhost:4000/unsubscribe?uid=dev-test"
  });

  res.json(result);
});

app.post("/dev/test-queue", async (_req, res) => {
  const result = await enqueueSendJob({
    type: "SEND_EMAIL",
    campaignId: "dev-campaign",
    contactId: "dev-contact"
  });

  res.json(result);
});

app.post("/dev/test-s3", async (_req, res) => {
  const result = await uploadAsset({
    key: `dev-tests/test-${Date.now()}.txt`,
    body: Buffer.from("S3 upload test from Email Campaign Platform"),
    contentType: "text/plain"
  });

  res.json(result);
});

app.post("/dev/simulate-open", async (req, res) => {
  const { campaignId, contactId } = req.body as { campaignId: string; contactId: string };
  if (!campaignId || !contactId) {
    return res.status(400).json({ error: "campaignId and contactId required" });
  }

  await prisma.emailEvent.create({
    data: {
      campaignId,
      contactId,
      eventType: "OPENED"
    }
  });

  res.json({ message: "Simulated open event created" });
});

app.post("/dev/simulate-click", async (req, res) => {
  const { campaignId, contactId, url } = req.body as { campaignId: string; contactId: string; url?: string };
  if (!campaignId || !contactId) {
    return res.status(400).json({ error: "campaignId and contactId required" });
  }

  await prisma.emailEvent.create({
    data: {
      campaignId,
      contactId,
      eventType: "CLICKED",
      metadata: url ? { url } : {}
    }
  });

  res.json({ message: "Simulated click event created" });
});

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
