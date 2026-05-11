import { EventType, SuppressionReason } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export const publicRouter = Router();

const SOFT_BOUNCE_WINDOW_DAYS = 30;
const SOFT_BOUNCE_THRESHOLD = 3;

function isTrustedSigningCertUrl(urlRaw: string) {
  try {
    const url = new URL(urlRaw);
    return url.protocol === "https:" && url.hostname.endsWith(".amazonaws.com");
  } catch {
    return false;
  }
}

const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wm3h3cAAAAASUVORK5CYII=",
  "base64"
);

function parseUid(uidRaw: string | null) {
  if (!uidRaw) return null;
  const decoded = Buffer.from(uidRaw, "base64url").toString("utf8");
  const [campaignId, contactId] = decoded.split(":");
  if (!campaignId || !contactId) return null;
  return { campaignId, contactId };
}

function sanitizeRedirectUrl(raw: string) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function makeUid(campaignId: string, contactId: string) {
  return Buffer.from(`${campaignId}:${contactId}`).toString("base64url");
}

publicRouter.get("/track/open", async (req, res) => {
  try {
    const uid = parseUid(String(req.query.uid ?? ""));
    if (uid) {
      await prisma.emailEvent.create({
        data: {
          campaignId: uid.campaignId,
          contactId: uid.contactId,
          eventType: EventType.OPENED,
          ip: req.ip,
          userAgent: req.headers["user-agent"] ?? null
        }
      });
    }
  } catch (error) {
    console.error("[GET /track/open]", error);
  }

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  return res.status(200).send(transparentPng);
});

publicRouter.get("/track/click", async (req, res) => {
  const uid = parseUid(String(req.query.uid ?? ""));
  const rawUrl = String(req.query.url ?? "");
  const url = sanitizeRedirectUrl(rawUrl);

  if (!url) {
    return res.status(400).send("Invalid URL");
  }

  try {
    if (uid) {
      await prisma.emailEvent.create({
        data: {
          campaignId: uid.campaignId,
          contactId: uid.contactId,
          eventType: EventType.CLICKED,
          ip: req.ip,
          userAgent: req.headers["user-agent"] ?? null,
          metadata: { url }
        }
      });
    }
  } catch (error) {
    console.error("[GET /track/click]", error);
  }

  return res.redirect(302, url);
});

publicRouter.get("/unsubscribe", async (req, res) => {
  const uid = parseUid(String(req.query.uid ?? ""));
  if (!uid) {
    return res.status(400).send("Invalid unsubscribe link.");
  }

  const contact = await prisma.contact.findUnique({
    where: { id: uid.contactId },
    include: { organisation: true }
  });

  if (!contact) {
    return res.status(404).send("Contact not found.");
  }

  await prisma.contact.update({
    where: { id: contact.id },
    data: { status: "UNSUBSCRIBED" }
  });

  await prisma.suppressionList.upsert({
    where: {
      orgId_email: {
        orgId: contact.orgId,
        email: contact.email
      }
    },
    update: { reason: SuppressionReason.UNSUBSCRIBED },
    create: {
      orgId: contact.orgId,
      email: contact.email,
      reason: SuppressionReason.UNSUBSCRIBED
    }
  });

  await prisma.emailEvent.create({
    data: {
      campaignId: uid.campaignId,
      contactId: uid.contactId,
      eventType: EventType.UNSUBSCRIBED,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null
    }
  });

  await prisma.campaignSend.updateMany({
    where: {
      campaignId: uid.campaignId,
      contactId: uid.contactId
    },
    data: {
      status: "UNSUBSCRIBED"
    }
  });

  const brandName = contact.organisation.name || "Email Campaign";
  const logo = contact.organisation.logoUrl
    ? `<img src="${contact.organisation.logoUrl}" alt="${brandName}" style="max-height:48px;display:block;margin:0 auto 12px;" />`
    : "";

  return res.send(`<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;background:#f5f7fb;margin:0;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #d8dee9;border-radius:8px;padding:24px;">
      ${logo}
      <h2 style="margin:0 0 8px;color:#172033;">You Have Been Unsubscribed</h2>
      <p style="margin:0 0 14px;color:#4b5563;">You have been unsubscribed from ${brandName} emails.</p>
      <form method="POST" action="/unsubscribe" style="margin:0;">
        <input type="hidden" name="uid" value="${String(req.query.uid ?? "")}" />
        <input type="hidden" name="action" value="resubscribe" />
        <button type="submit" style="background:#1f5eff;color:#fff;border:none;padding:10px 14px;border-radius:6px;cursor:pointer;">Re-subscribe</button>
      </form>
    </div>
  </body>
</html>`);
});

publicRouter.post("/unsubscribe", async (req, res) => {
  const schema = z.object({
    uid: z.string().min(1).optional(),
    action: z.enum(["unsubscribe", "resubscribe"]).optional().default("unsubscribe")
  });
  const input = {
    uid: (req.body as Record<string, unknown>)?.uid ?? req.query.uid,
    action: (req.body as Record<string, unknown>)?.action ?? "unsubscribe"
  };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const uid = parseUid(String(parsed.data.uid ?? ""));
  if (!uid) return res.status(400).json({ message: "Invalid unsubscribe token" });

  const contact = await prisma.contact.findUnique({ where: { id: uid.contactId } });
  if (!contact) return res.status(404).json({ message: "Contact not found" });

  if (parsed.data.action === "resubscribe") {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { status: "ACTIVE" }
    });

    await prisma.suppressionList.deleteMany({
      where: {
        orgId: contact.orgId,
        email: contact.email,
        reason: SuppressionReason.UNSUBSCRIBED
      }
    });

    await prisma.campaignSend.updateMany({
      where: {
        campaignId: uid.campaignId,
        contactId: uid.contactId,
        status: "UNSUBSCRIBED"
      },
      data: { status: "QUEUED" }
    });

    return res.send("<html><body style=\"font-family:Arial,sans-serif;padding:24px;\"><h2>Re-subscribed</h2><p>Your subscription has been restored.</p></body></html>");
  }

  await prisma.contact.update({
    where: { id: contact.id },
    data: { status: "UNSUBSCRIBED" }
  });

  await prisma.suppressionList.upsert({
    where: {
      orgId_email: {
        orgId: contact.orgId,
        email: contact.email
      }
    },
    update: { reason: SuppressionReason.UNSUBSCRIBED },
    create: {
      orgId: contact.orgId,
      email: contact.email,
      reason: SuppressionReason.UNSUBSCRIBED
    }
  });

  await prisma.campaignSend.updateMany({
    where: {
      campaignId: uid.campaignId,
      contactId: uid.contactId
    },
    data: {
      status: "UNSUBSCRIBED"
    }
  });

  return res.json({ message: "Unsubscribed successfully" });
});

publicRouter.get("/preferences", async (req, res) => {
  const uid = parseUid(String(req.query.uid ?? ""));
  if (!uid) return res.status(400).send("Invalid token");

  const contact = await prisma.contact.findUnique({
    where: { id: uid.contactId },
    include: { lists: { include: { list: true } } }
  });
  if (!contact) return res.status(404).send("Contact not found");

  const subscriptions = contact.lists.map((m) => ({ listId: m.listId, name: m.list.name }));
  const rows = subscriptions
    .map((s) => `<label style="display:flex;gap:8px;align-items:center;margin:8px 0;"><input type="checkbox" name="subscribedListIds" value="${s.listId}" checked /> <span>${s.name}</span></label>`)
    .join("");

  return res.send(`<!doctype html>
<html><body style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #d8dee9;border-radius:8px;padding:20px;">
    <h2 style="margin:0 0 8px;">Preference Center</h2>
    <p style="margin:0 0 12px;color:#475569;">Manage subscriptions for ${contact.email}</p>
    <form method="POST" action="/preferences">
      <input type="hidden" name="uid" value="${String(req.query.uid ?? "")}" />
      ${rows || "<p>No subscriptions available.</p>"}
      <button type="submit" style="margin-top:12px;background:#155eef;color:#fff;border:none;padding:10px 14px;border-radius:6px;cursor:pointer;">Save Preferences</button>
    </form>
  </div>
</body></html>`);
});

publicRouter.post("/preferences", async (req, res) => {
  const incoming = req.body as Record<string, unknown>;
  const normalizedListIds = Array.isArray(incoming.subscribedListIds)
    ? incoming.subscribedListIds
    : incoming.subscribedListIds
      ? [incoming.subscribedListIds]
      : [];
  const schema = z.object({
    uid: z.string().min(1),
    subscribedListIds: z.array(z.string()).default([])
  });
  const parsed = schema.safeParse({
    uid: incoming.uid,
    subscribedListIds: normalizedListIds
  });
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const uid = parseUid(parsed.data.uid);
  if (!uid) return res.status(400).json({ message: "Invalid token" });

  const contact = await prisma.contact.findUnique({ where: { id: uid.contactId } });
  if (!contact) return res.status(404).json({ message: "Contact not found" });

  const current = await prisma.contactListMember.findMany({
    where: { contactId: contact.id },
    select: { listId: true }
  });
  const currentSet = new Set(current.map((c) => c.listId));
  const targetSet = new Set(parsed.data.subscribedListIds);

  const toAdd = Array.from(targetSet).filter((id) => !currentSet.has(id));
  const toRemove = Array.from(currentSet).filter((id) => !targetSet.has(id));

  for (const listId of toAdd) {
    await prisma.contactListMember.upsert({
      where: { contactId_listId: { contactId: contact.id, listId } },
      update: {},
      create: { contactId: contact.id, listId }
    });
  }

  if (toRemove.length > 0) {
    await prisma.contactListMember.deleteMany({
      where: {
        contactId: contact.id,
        listId: { in: toRemove }
      }
    });
  }

  return res.send("<html><body style=\"font-family:Arial,sans-serif;padding:24px;\"><h2>Preferences updated</h2><p>Your subscription preferences have been saved.</p></body></html>");
});

publicRouter.post("/webhooks/ses", async (req, res) => {
  try {
    const payload = req.body as {
      Type?: string;
      Message?: string;
      SubscribeURL?: string;
      TopicArn?: string;
      MessageId?: string;
      SigningCertURL?: string;
      eventType?: string;
      mail?: { messageId?: string };
      bounce?: { bounceType?: string };
      complaint?: Record<string, unknown>;
    };

    if (payload.SigningCertURL && !isTrustedSigningCertUrl(payload.SigningCertURL)) {
      return res.status(400).json({ message: "Untrusted SNS signing cert URL" });
    }
    if (env.SES_SNS_TOPIC_ARN && payload.TopicArn && payload.TopicArn !== env.SES_SNS_TOPIC_ARN) {
      return res.status(400).json({ message: "SNS topic mismatch" });
    }

    if (payload.Type === "SubscriptionConfirmation") {
      return res.json({ message: "Subscription confirmation acknowledged", subscribeUrl: payload.SubscribeURL ?? null });
    }

    if (payload.Type === "UnsubscribeConfirmation") {
      return res.json({ message: "Unsubscribe confirmation acknowledged" });
    }

    let event = payload as Record<string, unknown>;
    if (payload.Message) {
      try {
        event = JSON.parse(payload.Message) as Record<string, unknown>;
      } catch {
        event = payload as Record<string, unknown>;
      }
    }

    const eventType = String(event.eventType ?? "").toLowerCase();
    const eventId = String(event.eventId ?? payload.MessageId ?? "");
    const mail = (event.mail ?? {}) as Record<string, unknown>;
    const sesMessageId = String(mail.messageId ?? "");

    if (!sesMessageId) return res.json({ message: "Ignored: missing messageId" });

    const send = await prisma.campaignSend.findFirst({
      where: { sesMessageId },
      include: { contact: true }
    });
    if (!send) return res.json({ message: "Ignored: send not found" });
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
      if (existing) return false;
      await prisma.emailEvent.create({
        data: {
          campaignId: campaignSend.campaignId,
          contactId: campaignSend.contactId,
          eventType: input.eventType,
          metadata: { ...(input.metadata ?? {}), ...(eventId ? { eventId } : {}) }
        }
      });
      return true;
    }

    if (eventType === "delivery") {
      await prisma.campaignSend.update({
        where: { id: campaignSend.id },
        data: { status: "DELIVERED" }
      });
      await createDedupedEvent({ eventType: EventType.DELIVERED });
    }

    if (eventType === "bounce") {
      const bounce = (event.bounce ?? {}) as Record<string, unknown>;
      const bounceType = String(bounce.bounceType ?? "Transient");
      const isHardBounce = bounceType.toLowerCase() === "permanent";

      await prisma.campaignSend.update({
        where: { id: campaignSend.id },
        data: { status: "BOUNCED" }
      });
      await createDedupedEvent({ eventType: EventType.BOUNCED, metadata: { bounceType } });

      if (isHardBounce) {
        await prisma.contact.update({
          where: { id: campaignSend.contactId },
          data: { status: "BOUNCED" }
        });
        await prisma.suppressionList.upsert({
          where: {
            orgId_email: {
              orgId: campaignSend.contact.orgId,
              email: campaignSend.contact.email
            }
          },
          update: { reason: SuppressionReason.BOUNCED },
          create: {
            orgId: campaignSend.contact.orgId,
            email: campaignSend.contact.email,
            reason: SuppressionReason.BOUNCED
          }
        });
      } else {
        const since = new Date(Date.now() - SOFT_BOUNCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const softBouncesInWindow = await prisma.emailEvent.count({
          where: {
            contactId: campaignSend.contactId,
            eventType: EventType.BOUNCED,
            occurredAt: { gte: since },
            metadata: {
              path: ["bounceType"],
              string_contains: "Transient"
            }
          }
        });

        if (softBouncesInWindow >= SOFT_BOUNCE_THRESHOLD) {
          await prisma.contact.update({
            where: { id: campaignSend.contactId },
            data: { status: "BOUNCED" }
          });
          await prisma.suppressionList.upsert({
            where: {
              orgId_email: {
                orgId: campaignSend.contact.orgId,
                email: campaignSend.contact.email
              }
            },
            update: { reason: SuppressionReason.BOUNCED },
            create: {
              orgId: campaignSend.contact.orgId,
              email: campaignSend.contact.email,
              reason: SuppressionReason.BOUNCED
            }
          });
        }
      }
    }

    if (eventType === "complaint") {
      await prisma.campaignSend.update({
        where: { id: campaignSend.id },
        data: { status: "COMPLAINED" }
      });
      await prisma.contact.update({
        where: { id: campaignSend.contactId },
        data: { status: "COMPLAINED" }
      });
      await prisma.suppressionList.upsert({
        where: {
          orgId_email: {
            orgId: campaignSend.contact.orgId,
            email: campaignSend.contact.email
          }
        },
        update: { reason: SuppressionReason.COMPLAINED },
        create: {
          orgId: campaignSend.contact.orgId,
          email: campaignSend.contact.email,
          reason: SuppressionReason.COMPLAINED
        }
      });
      await createDedupedEvent({ eventType: EventType.COMPLAINED });
    }

    if (eventType === "open") {
      await createDedupedEvent({ eventType: EventType.OPENED });
    }

    if (eventType === "click") {
      const click = (event.click ?? {}) as Record<string, unknown>;
      const link = String(click.link ?? "");
      await createDedupedEvent({ eventType: EventType.CLICKED, metadata: link ? { url: link } : {} });
    }

    return res.json({ message: "Event processed", eventType });
  } catch (error) {
    console.error("[POST /webhooks/ses]", error);
    return res.status(500).json({ message: "Failed to process SES webhook" });
  }
});

export { makeUid };
