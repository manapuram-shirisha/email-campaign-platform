import "dotenv/config";
import { CampaignStatus, EventType } from "@prisma/client";
import { prisma } from "./lib/prisma.js";
import { env } from "./config/env.js";
import { deleteSendJob, enqueueSendJob, receiveSendJobs, receiveEventJobs, deleteEventJob } from "./services/queue.js";
import { sendWorkerEmail } from "./services/mailer.js";

function makeUid(campaignId: string, contactId: string) {
  return Buffer.from(`${campaignId}:${contactId}`).toString("base64url");
}

function rewriteLinksForTracking(html: string, uid: string) {
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (_m, url: string) => {
    if (url.startsWith(`${env.PUBLIC_API_URL}/unsubscribe`)) {
      return `href="${url}"`;
    }
    const tracked = `${env.PUBLIC_API_URL}/track/click?uid=${encodeURIComponent(uid)}&url=${encodeURIComponent(url)}`;
    return `href="${tracked}"`;
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getCustomField(customFields: unknown, key: string) {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return "";
  const value = (customFields as Record<string, unknown>)[key];
  return value == null ? "" : String(value);
}

function mergeTags(html: string, input: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  customFields?: unknown;
  unsubscribeUrl?: string;
}) {
  return html.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    if (key === "first_name") return escapeHtml(input.firstName ?? "");
    if (key === "last_name") return escapeHtml(input.lastName ?? "");
    if (key === "email") return escapeHtml(input.email);
    if (key === "unsubscribe_link") {
      if (!input.unsubscribeUrl) return "";
      return `<a href="${input.unsubscribeUrl}" style="color:#155eef;text-decoration:underline;">Unsubscribe</a>`;
    }
    if (key.startsWith("custom.")) {
      return escapeHtml(getCustomField(input.customFields, key.slice("custom.".length)));
    }
    return "";
  });
}

function appendTrackingPixel(html: string, uid: string) {
  const pixel = `<img src="${env.PUBLIC_API_URL}/track/open?uid=${encodeURIComponent(uid)}" alt="" width="1" height="1" style="display:none;" />`;
  if (html.includes("</body>")) return html.replace("</body>", `${pixel}</body>`);
  return `${html}${pixel}`;
}

function appendUnsubscribeFooter(html: string, uid: string) {
  const url = `${env.PUBLIC_API_URL}/unsubscribe?uid=${encodeURIComponent(uid)}`;
  const footer = `<div style="margin-top:24px;font-family:Arial,sans-serif;font-size:12px;color:#666;">
<p style="margin:0 0 8px;">If you no longer wish to receive these emails, you can <a href="${url}">unsubscribe here</a>.</p>
</div>`;

  if (html.includes("</body>")) return html.replace("</body>", `${footer}</body>`);
  return `${html}${footer}`;
}

async function processQueueMessage(message: {
  MessageId?: string;
  ReceiptHandle?: string;
  Body?: string;
}) {
  const body = JSON.parse(message.Body ?? "{}") as {
    type?: string;
    campaignId?: string;
    campaignSendId?: string;
    contactId?: string;
    to?: string;
    subject?: string;
    html?: string;
    fromEmail?: string;
    replyToEmail?: string | null;
  };

  if (body.type !== "SEND_CAMPAIGN" && body.type !== "TEST_SEND") return { shouldDelete: true as const };
  if (!body.to || !body.subject || !body.html || !body.fromEmail) return { shouldDelete: true as const };

  if (body.type === "SEND_CAMPAIGN" && body.campaignId && body.campaignSendId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: body.campaignId },
      select: { status: true }
    });

    if (!campaign) {
      return { shouldDelete: true as const };
    }
    if (campaign.status === CampaignStatus.PAUSED) {
      return { shouldDelete: false as const };
    }
    if (campaign.status === CampaignStatus.CANCELLED) {
      await prisma.campaignSend.update({
        where: { id: body.campaignSendId },
        data: { status: "FAILED" }
      });
      return { shouldDelete: true as const };
    }
    if (campaign.status !== CampaignStatus.SENDING) {
      return { shouldDelete: false as const };
    }
  }

  const uid = body.campaignId && body.contactId ? makeUid(body.campaignId, body.contactId) : null;
  const unsubscribeUrl = uid ? `${env.PUBLIC_API_URL}/unsubscribe?uid=${encodeURIComponent(uid)}` : undefined;
  const contact = body.contactId
    ? await prisma.contact.findUnique({
        where: { id: body.contactId },
        select: {
          email: true,
          firstName: true,
          lastName: true,
          customFields: true
        }
      })
    : null;
  let finalHtml = body.html;
  finalHtml = mergeTags(finalHtml, {
    email: contact?.email ?? body.to,
    firstName: contact?.firstName ?? "Test",
    lastName: contact?.lastName ?? "Recipient",
    customFields: contact?.customFields ?? { company: "Test Company", city: "Hyderabad" },
    unsubscribeUrl
  });
  if (uid) {
    finalHtml = rewriteLinksForTracking(finalHtml, uid);
    finalHtml = appendTrackingPixel(finalHtml, uid);
    finalHtml = appendUnsubscribeFooter(finalHtml, uid);
  }

  const sent = await sendWorkerEmail({
    to: body.to,
    subject: body.subject,
    html: finalHtml,
    fromEmail: body.fromEmail,
    replyToEmail: body.replyToEmail,
    unsubscribeUrl
  });

  if (body.type === "SEND_CAMPAIGN" && body.campaignSendId) {
    await prisma.campaignSend.update({
      where: { id: body.campaignSendId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        sesMessageId: sent.messageId
      }
    });

    await prisma.emailEvent.create({
      data: {
        campaignId: body.campaignId ?? null,
        contactId: body.contactId ?? null,
        eventType: "SENT"
      }
    });

    await markCampaignSentIfComplete(body.campaignId);
  }

  return { shouldDelete: true as const };
}

async function markFailedFromMessage(message: { Body?: string }) {
  try {
    const body = JSON.parse(message.Body ?? "{}") as { campaignSendId?: string };
    if (!body.campaignSendId) return;
    await prisma.campaignSend.update({
      where: { id: body.campaignSendId },
      data: { status: "FAILED" }
    });
  } catch {
    // ignore parse/update errors while dead-lettering
  }
}

async function markCampaignSentIfComplete(campaignId?: string) {
  if (!campaignId) return;

  const remainingQueued = await prisma.campaignSend.count({
    where: {
      campaignId,
      status: "QUEUED"
    }
  });

  if (remainingQueued > 0) return;

  await prisma.campaign.updateMany({
    where: {
      id: campaignId,
      status: CampaignStatus.SENDING
    },
    data: {
      status: CampaignStatus.SENT
    }
  });
}

async function processEventMessage(message: {
  MessageId?: string;
  ReceiptHandle?: string;
  Body?: string;
}) {
  const body = JSON.parse(message.Body ?? "{}") as Record<string, unknown>;

  const eventType = String(body.eventType ?? "").toLowerCase();
  const eventId = String(body.eventId ?? message.MessageId ?? "");
  const mail = (body.mail ?? {}) as Record<string, unknown>;
  const sesMessageId = String(mail.messageId ?? "");

  if (!sesMessageId) return { shouldDelete: true as const };

  const send = await prisma.campaignSend.findFirst({
    where: { sesMessageId },
    include: { contact: true }
  });
  if (!send) return { shouldDelete: true as const };
  const campaignSend = send;

  async function createDedupedEvent(input: {
    eventType: EventType;
    metadata?: Record<string, unknown>;
  }) {
    const existing = eventId
      ? await prisma.emailEvent.findFirst({
          where: {
            campaignId: campaignSend.campaignId,
            contactId: campaignSend.contactId,
            eventType: input.eventType,
            metadata: {
              path: ["eventId"],
              equals: eventId
            }
          }
        })
      : null;
    if (existing) return;

    await prisma.emailEvent.create({
      data: {
        campaignId: campaignSend.campaignId,
        contactId: campaignSend.contactId,
        eventType: input.eventType,
        metadata: input.metadata ? { ...input.metadata, eventId } : { eventId }
      }
    });
  }

  if (eventType === "bounce") {
    const bounce = (body.bounce ?? {}) as Record<string, unknown>;
    const bounceType = String(bounce.bounceType ?? "");
    await createDedupedEvent({
      eventType: EventType.BOUNCED,
      metadata: { bounceType }
    });
    await prisma.campaignSend.update({
      where: { id: campaignSend.id },
      data: { status: "BOUNCED" }
    });
  } else if (eventType === "complaint") {
    await createDedupedEvent({
      eventType: EventType.COMPLAINED
    });
    await prisma.campaignSend.update({
      where: { id: campaignSend.id },
      data: { status: "COMPLAINED" }
    });
  } else if (eventType === "delivery") {
    await prisma.campaignSend.update({
      where: { id: campaignSend.id },
      data: { status: "DELIVERED" }
    });
  } else if (eventType === "open") {
    await createDedupedEvent({
      eventType: EventType.OPENED
    });
  } else if (eventType === "click") {
    const click = (body.click ?? {}) as Record<string, unknown>;
    const link = String(click.link ?? "");
    await createDedupedEvent({
      eventType: EventType.CLICKED,
      metadata: { url: link }
    });
  }

  return { shouldDelete: true as const };
}

async function processScheduledCampaigns() {
  const dueCampaigns = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.SCHEDULED,
      scheduledAt: { lte: new Date() }
    },
    include: {
      template: true,
      sends: {
        where: { status: "QUEUED" },
        include: { contact: true }
      }
    }
  });

  for (const campaign of dueCampaigns) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.SENDING }
    });

    if (!campaign.template) continue;

    for (const send of campaign.sends) {
      await enqueueSendJob({
        type: "SEND_CAMPAIGN",
        campaignId: campaign.id,
        campaignSendId: send.id,
        contactId: send.contactId,
        to: send.contact.email,
        subject: campaign.subject,
        html: campaign.template.html,
        fromEmail: campaign.fromEmail,
        replyToEmail: campaign.replyToEmail
      });
    }
  }
}

async function workerTick() {
  try {
    await processScheduledCampaigns();

    const jobs = await receiveSendJobs();
    for (const message of jobs) {
      let shouldDelete = true;
      const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? "1");
      if (receiveCount > env.WORKER_MAX_RECEIVE_COUNT) {
        await markFailedFromMessage(message);
        if (message.ReceiptHandle) await deleteSendJob(message.ReceiptHandle);
        continue;
      }
      try {
        const result = await processQueueMessage(message);
        shouldDelete = result.shouldDelete;
      } catch (error) {
        console.error("[WORKER] failed message", message.MessageId, error);
        shouldDelete = false;
      } finally {
        if (shouldDelete && message.ReceiptHandle) {
          await deleteSendJob(message.ReceiptHandle);
        }
      }
    }

    const eventJobs = await receiveEventJobs();
    for (const message of eventJobs) {
      let shouldDelete = true;
      try {
        const result = await processEventMessage(message);
        shouldDelete = result.shouldDelete;
      } catch (error) {
        console.error("[WORKER] failed event message", message.MessageId, error);
        shouldDelete = false;
      } finally {
        if (shouldDelete && message.ReceiptHandle) {
          await deleteEventJob(message.ReceiptHandle);
        }
      }
    }
  } catch (error) {
    console.error("[WORKER] tick failed", error);
  }
}

console.log(`[WORKER] started in ${env.EMAIL_PROVIDER.toUpperCase()} mode`);
setInterval(() => {
  void workerTick();
}, 5000);
