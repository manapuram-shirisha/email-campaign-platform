import { CampaignStatus, ContactStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { enqueueSendJob } from "../services/queue.js";

export const campaignRouter = Router();

campaignRouter.use(requireAuth);

const writeAccess = requireRole("SUPER_ADMIN", "CAMPAIGN_MANAGER");

const statusSchema = z.nativeEnum(CampaignStatus);

const createCampaignSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  previewText: z.string().optional().default(""),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  replyToEmail: z.string().email().optional().nullable(),
  templateId: z.string().optional().nullable(),
  timezone: z.string().optional().nullable().default("Asia/Kolkata"),
  tags: z.array(z.string()).optional().default([])
});

const updateCampaignSchema = createCampaignSchema.partial();

const scheduleSchema = z.object({
  sendAt: z.string().datetime(),
  timezone: z.string().optional().nullable().default("Asia/Kolkata"),
  listIds: z.array(z.string()).optional().default([]),
  segmentId: z.string().optional().nullable(),
  excludeListIds: z.array(z.string()).optional().default([])
});

const sendSchema = z.object({
  listIds: z.array(z.string()).optional().default([]),
  segmentId: z.string().optional().nullable(),
  excludeListIds: z.array(z.string()).optional().default([])
});

const testSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(5)
});

const SCHEDULE_EDIT_CUTOFF_MS = 15 * 60 * 1000;

type SegmentCondition = {
  field: string;
  operator: string;
  value?: unknown;
};

type SegmentRules = {
  operator: "AND" | "OR";
  conditions: SegmentCondition[];
};

function evaluateCondition(contact: {
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: ContactStatus;
  customFields: Prisma.JsonValue;
}, condition: SegmentCondition) {
  const field = condition.field;
  const operator = condition.operator;
  const value = condition.value;

  let actual: unknown;
  if (field === "email") actual = contact.email;
  else if (field === "first_name") actual = contact.firstName ?? "";
  else if (field === "last_name") actual = contact.lastName ?? "";
  else if (field === "status") actual = contact.status;
  else if (field.startsWith("custom.")) {
    const key = field.slice("custom.".length);
    const custom = (contact.customFields ?? {}) as Record<string, unknown>;
    actual = custom[key];
  } else {
    return false;
  }

  if (operator === "equals") return String(actual ?? "") === String(value ?? "");
  if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(value ?? "").toLowerCase());
  if (operator === "not_equals") return String(actual ?? "") !== String(value ?? "");
  if (operator === "in") {
    const vals = Array.isArray(value) ? value : [];
    return vals.map((v) => String(v)).includes(String(actual ?? ""));
  }

  return false;
}

function matchesSegment(contact: {
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: ContactStatus;
  customFields: Prisma.JsonValue;
}, rules: SegmentRules) {
  const checks = rules.conditions.map((c) => evaluateCondition(contact, c));
  if (rules.operator === "OR") return checks.some(Boolean);
  return checks.every(Boolean);
}

async function resolveRecipients(input: {
  orgId: string;
  listIds: string[];
  excludeListIds: string[];
  segmentId?: string | null;
}) {
  const includeIds = new Set<string>();
  const excludeIds = new Set<string>();

  if (input.listIds.length > 0) {
    const members = await prisma.contactListMember.findMany({
      where: {
        listId: { in: input.listIds },
        contact: {
          orgId: input.orgId,
          status: { notIn: [ContactStatus.UNSUBSCRIBED, ContactStatus.BOUNCED, ContactStatus.COMPLAINED] }
        }
      },
      select: { contactId: true }
    });
    for (const member of members) includeIds.add(member.contactId);
  }

  if (input.excludeListIds.length > 0) {
    const members = await prisma.contactListMember.findMany({
      where: {
        listId: { in: input.excludeListIds },
        contact: { orgId: input.orgId }
      },
      select: { contactId: true }
    });
    for (const member of members) excludeIds.add(member.contactId);
  }

  if (input.segmentId) {
    const segment = await prisma.segment.findFirst({
      where: { id: input.segmentId, orgId: input.orgId }
    });
    if (segment) {
      const contacts = await prisma.contact.findMany({
        where: {
          orgId: input.orgId,
          status: { notIn: [ContactStatus.UNSUBSCRIBED, ContactStatus.BOUNCED, ContactStatus.COMPLAINED] }
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          customFields: true
        }
      });
      const rules = segment.rules as SegmentRules;
      for (const contact of contacts) {
        if (matchesSegment(contact, rules)) includeIds.add(contact.id);
      }
    }
  }

  for (const id of excludeIds) includeIds.delete(id);

  if (includeIds.size === 0) return [];

  return prisma.contact.findMany({
    where: { id: { in: Array.from(includeIds) } },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true
    }
  });
}

async function queueCampaignSend(input: {
  campaignId: string;
  orgId: string;
  listIds: string[];
  segmentId?: string | null;
  excludeListIds: string[];
}) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, orgId: input.orgId },
    include: { template: true }
  });
  if (!campaign) {
    return { ok: false as const, status: 404, body: { message: "Campaign not found" } };
  }
  if (!campaign.templateId || !campaign.template) {
    return { ok: false as const, status: 400, body: { message: "Template is required before sending" } };
  }

  if (input.listIds.length === 0 && !input.segmentId) {
    return { ok: false as const, status: 400, body: { message: "Select at least one list or a segment before sending" } };
  }

  const recipients = await resolveRecipients({
    orgId: input.orgId,
    listIds: input.listIds,
    excludeListIds: input.excludeListIds,
    segmentId: input.segmentId
  });

  if (recipients.length === 0) {
    return { ok: false as const, status: 400, body: { message: "No recipients matched your selected audience" } };
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: CampaignStatus.SENDING, scheduledAt: new Date() }
  });

  for (const recipient of recipients) {
    const sendRow = await prisma.campaignSend.upsert({
      where: {
        campaignId_contactId: {
          campaignId: campaign.id,
          contactId: recipient.id
        }
      },
      update: {},
      create: {
        campaignId: campaign.id,
        contactId: recipient.id,
        status: "QUEUED"
      }
    });

    await enqueueSendJob({
      type: "SEND_CAMPAIGN",
      campaignId: campaign.id,
      campaignSendId: sendRow.id,
      contactId: recipient.id,
      to: recipient.email,
      subject: campaign.subject,
      html: campaign.template.html,
      fromEmail: campaign.fromEmail,
      replyToEmail: campaign.replyToEmail
    });
  }

  return {
    ok: true as const,
    status: 200,
    body: { message: "Campaign queued for sending", recipientCount: recipients.length }
  };
}

async function prepareScheduledAudience(input: {
  campaignId: string;
  orgId: string;
  listIds: string[];
  segmentId?: string | null;
  excludeListIds: string[];
}) {
  const recipients = await resolveRecipients({
    orgId: input.orgId,
    listIds: input.listIds,
    excludeListIds: input.excludeListIds,
    segmentId: input.segmentId
  });

  if (recipients.length === 0) {
    return { ok: false as const, status: 400, body: { message: "No recipients matched your selected audience" } };
  }

  const recipientIds = recipients.map((r) => r.id);

  await prisma.campaignSend.deleteMany({
    where: {
      campaignId: input.campaignId,
      contactId: { notIn: recipientIds },
      status: "QUEUED"
    }
  });

  for (const recipient of recipients) {
    await prisma.campaignSend.upsert({
      where: {
        campaignId_contactId: {
          campaignId: input.campaignId,
          contactId: recipient.id
        }
      },
      update: {
        status: "QUEUED"
      },
      create: {
        campaignId: input.campaignId,
        contactId: recipient.id,
        status: "QUEUED"
      }
    });
  }

  return { ok: true as const, recipientCount: recipients.length };
}

campaignRouter.post("/:id/estimate", writeAccess, async (req, res) => {
  try {
    const parsed = sendSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid audience payload", errors: parsed.error.flatten() });
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId }
    });
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });

    const recipients = await resolveRecipients({
      orgId: req.user!.orgId,
      listIds: parsed.data.listIds,
      excludeListIds: parsed.data.excludeListIds,
      segmentId: parsed.data.segmentId
    });

    return res.json({ recipientCount: recipients.length });
  } catch (error) {
    console.error("[POST /api/campaigns/:id/estimate]", error);
    return res.status(500).json({ message: "Failed to estimate recipients" });
  }
});

campaignRouter.get("/", async (req, res) => {
  try {
    const search = String(req.query.search ?? "").trim();
    const rawStatus = String(req.query.status ?? "").trim();
    const dateFromRaw = String(req.query.dateFrom ?? "").trim();
    const dateToRaw = String(req.query.dateTo ?? "").trim();
    const tagRaw = String(req.query.tag ?? "").trim();

    const where: Prisma.CampaignWhereInput = {
      orgId: req.user!.orgId
    };

    if (search) where.name = { contains: search, mode: "insensitive" };
    if (rawStatus) {
      const parsed = statusSchema.safeParse(rawStatus);
      if (!parsed.success) return res.status(400).json({ message: "Invalid status filter" });
      where.status = parsed.data;
    }
    if (dateFromRaw || dateToRaw) {
      where.updatedAt = {};
      if (dateFromRaw) {
        const from = new Date(dateFromRaw);
        if (!Number.isNaN(from.getTime())) where.updatedAt.gte = from;
      }
      if (dateToRaw) {
        const to = new Date(dateToRaw);
        if (!Number.isNaN(to.getTime())) where.updatedAt.lte = to;
      }
    }
    if (tagRaw) {
      where.tags = { has: tagRaw };
    }

    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: { updatedAt: "desc" }
    });

    return res.json({ campaigns });
  } catch (error) {
    console.error("[GET /api/campaigns]", error);
    return res.status(500).json({ message: "Failed to fetch campaigns" });
  }
});

campaignRouter.post("/", writeAccess, async (req, res) => {
  try {
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid campaign payload", errors: parsed.error.flatten() });
    }

    const data = parsed.data;
    const campaign = await prisma.campaign.create({
      data: {
        orgId: req.user!.orgId,
        name: data.name,
        subject: data.subject,
        previewText: data.previewText,
        fromName: data.fromName,
        fromEmail: data.fromEmail,
        replyToEmail: data.replyToEmail ?? null,
        templateId: data.templateId ?? null,
        timezone: data.timezone ?? "Asia/Kolkata",
        tags: data.tags,
        status: CampaignStatus.DRAFT
      }
    });

    return res.status(201).json({ campaign });
  } catch (error) {
    console.error("[POST /api/campaigns]", error);
    return res.status(500).json({ message: "Failed to create campaign" });
  }
});

campaignRouter.get("/:id", async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId }
    });

    if (!campaign) return res.status(404).json({ message: "Campaign not found" });
    return res.json({ campaign });
  } catch (error) {
    console.error("[GET /api/campaigns/:id]", error);
    return res.status(500).json({ message: "Failed to fetch campaign" });
  }
});

campaignRouter.put("/:id", writeAccess, async (req, res) => {
  try {
    const parsed = updateCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid campaign payload", errors: parsed.error.flatten() });
    }

    const existing = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId }
    });
    if (!existing) return res.status(404).json({ message: "Campaign not found" });
    if (existing.status !== CampaignStatus.DRAFT) {
      return res.status(400).json({ message: "Only draft campaigns can be edited" });
    }

    const data = parsed.data;
    const campaign = await prisma.campaign.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        subject: data.subject,
        previewText: data.previewText,
        fromName: data.fromName,
        fromEmail: data.fromEmail,
        replyToEmail: data.replyToEmail === undefined ? undefined : data.replyToEmail ?? null,
        templateId: data.templateId === undefined ? undefined : data.templateId ?? null,
        timezone: data.timezone === undefined ? undefined : data.timezone ?? "Asia/Kolkata",
        tags: data.tags === undefined ? undefined : data.tags
      }
    });

    return res.json({ campaign });
  } catch (error) {
    console.error("[PUT /api/campaigns/:id]", error);
    return res.status(500).json({ message: "Failed to update campaign" });
  }
});

campaignRouter.delete("/:id", writeAccess, async (req, res) => {
  try {
    const existing = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId }
    });
    if (!existing) return res.status(404).json({ message: "Campaign not found" });
    if (existing.status !== CampaignStatus.DRAFT) {
      return res.status(400).json({ message: "Only draft campaigns can be deleted" });
    }

    await prisma.campaign.delete({ where: { id: existing.id } });
    return res.json({ message: "Campaign deleted" });
  } catch (error) {
    console.error("[DELETE /api/campaigns/:id]", error);
    return res.status(500).json({ message: "Failed to delete campaign" });
  }
});

campaignRouter.post("/:id/duplicate", writeAccess, async (req, res) => {
  try {
    const existing = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId }
    });
    if (!existing) return res.status(404).json({ message: "Campaign not found" });

    const duplicate = await prisma.campaign.create({
      data: {
        orgId: existing.orgId,
        name: `${existing.name} (Copy)`,
        subject: existing.subject,
        previewText: existing.previewText,
        fromName: existing.fromName,
        fromEmail: existing.fromEmail,
        replyToEmail: existing.replyToEmail,
        templateId: existing.templateId,
        timezone: existing.timezone,
        tags: existing.tags,
        status: CampaignStatus.DRAFT
      }
    });

    return res.status(201).json({ campaign: duplicate });
  } catch (error) {
    console.error("[POST /api/campaigns/:id/duplicate]", error);
    return res.status(500).json({ message: "Failed to duplicate campaign" });
  }
});

campaignRouter.post("/:id/test", writeAccess, async (req, res) => {
  try {
    const parsed = testSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid test payload", errors: parsed.error.flatten() });
    }

    const existing = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId },
      include: { template: true }
    });
    if (!existing) return res.status(404).json({ message: "Campaign not found" });

    const testJobs = await Promise.all(
      parsed.data.emails.map((email) =>
        enqueueSendJob({
          type: "TEST_SEND",
          campaignId: existing.id,
          to: email,
          subject: existing.subject,
          html: existing.template?.html ?? "<p>No template selected</p>",
          fromEmail: existing.fromEmail,
          replyToEmail: existing.replyToEmail
        })
      )
    );

    return res.json({ message: "Test send queued", jobs: testJobs });
  } catch (error) {
    console.error("[POST /api/campaigns/:id/test]", error);
    return res.status(500).json({ message: "Failed to queue test send" });
  }
});

campaignRouter.post("/:id/send", writeAccess, async (req, res) => {
  try {
    const parsed = sendSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid send payload", errors: parsed.error.flatten() });
    }

    const result = await queueCampaignSend({
      campaignId: String(req.params.id),
      orgId: req.user!.orgId,
      listIds: parsed.data.listIds,
      segmentId: parsed.data.segmentId,
      excludeListIds: parsed.data.excludeListIds
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("[POST /api/campaigns/:id/send]", error);
    return res.status(500).json({ message: "Failed to send campaign" });
  }
});

campaignRouter.post("/:id/send-now", writeAccess, async (req, res) => {
  try {
    const parsed = sendSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid send payload", errors: parsed.error.flatten() });
    }

    const result = await queueCampaignSend({
      campaignId: String(req.params.id),
      orgId: req.user!.orgId,
      listIds: parsed.data.listIds,
      segmentId: parsed.data.segmentId,
      excludeListIds: parsed.data.excludeListIds
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("[POST /api/campaigns/:id/send-now]", error);
    return res.status(500).json({ message: "Failed to send campaign" });
  }
});

campaignRouter.post("/:id/schedule", writeAccess, async (req, res) => {
  try {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid schedule payload", errors: parsed.error.flatten() });
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId }
    });
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });
    if (!campaign.templateId) return res.status(400).json({ message: "Template is required before scheduling" });
    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
      return res.status(400).json({ message: "Only draft/scheduled campaigns can be scheduled" });
    }
    if (campaign.status === CampaignStatus.SCHEDULED && campaign.scheduledAt) {
      const msUntilDispatch = campaign.scheduledAt.getTime() - Date.now();
      if (msUntilDispatch <= SCHEDULE_EDIT_CUTOFF_MS) {
        return res.status(400).json({ message: "Schedule can be edited only up to 15 minutes before dispatch" });
      }
    }

    const scheduledAt = new Date(parsed.data.sendAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: "sendAt must be a future datetime" });
    }

    const prepared = await prepareScheduledAudience({
      campaignId: campaign.id,
      orgId: req.user!.orgId,
      listIds: parsed.data.listIds,
      segmentId: parsed.data.segmentId,
      excludeListIds: parsed.data.excludeListIds
    });
    if (!prepared.ok) return res.status(prepared.status).json(prepared.body);

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        scheduledAt,
        timezone: parsed.data.timezone ?? "Asia/Kolkata",
        status: CampaignStatus.SCHEDULED
      }
    });

    return res.json({
      campaign: updated,
      message: "Campaign scheduled",
      recipientCount: prepared.recipientCount
    });
  } catch (error) {
    console.error("[POST /api/campaigns/:id/schedule]", error);
    return res.status(500).json({ message: "Failed to schedule campaign" });
  }
});

campaignRouter.post("/:id/pause", writeAccess, async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId }
    });
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });
    if (campaign.status !== CampaignStatus.SENDING) {
      return res.status(400).json({ message: "Only sending campaigns can be paused" });
    }

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.PAUSED }
    });

    return res.json({ campaign: updated, message: "Campaign paused" });
  } catch (error) {
    console.error("[POST /api/campaigns/:id/pause]", error);
    return res.status(500).json({ message: "Failed to pause campaign" });
  }
});

campaignRouter.post("/:id/resume", writeAccess, async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId }
    });
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });
    if (campaign.status !== CampaignStatus.PAUSED) {
      return res.status(400).json({ message: "Only paused campaigns can be resumed" });
    }

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.SENDING }
    });

    return res.json({ campaign: updated, message: "Campaign resumed" });
  } catch (error) {
    console.error("[POST /api/campaigns/:id/resume]", error);
    return res.status(500).json({ message: "Failed to resume campaign" });
  }
});

campaignRouter.post("/:id/cancel", writeAccess, async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId }
    });
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });
    if (campaign.status !== CampaignStatus.SCHEDULED) {
      return res.status(400).json({ message: "Only scheduled campaigns can be cancelled" });
    }

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.CANCELLED }
    });

    return res.json({ campaign: updated, message: "Campaign cancelled" });
  } catch (error) {
    console.error("[POST /api/campaigns/:id/cancel]", error);
    return res.status(500).json({ message: "Failed to cancel campaign" });
  }
});

campaignRouter.get("/:id/progress", async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId }
    });
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });

    const [total, sent, delivered, queued, failed] = await Promise.all([
      prisma.campaignSend.count({ where: { campaignId: campaign.id } }),
      prisma.campaignSend.count({
        where: {
          campaignId: campaign.id,
          status: { in: ["SENT", "DELIVERED"] }
        }
      }),
      prisma.campaignSend.count({ where: { campaignId: campaign.id, status: "DELIVERED" } }),
      prisma.campaignSend.count({ where: { campaignId: campaign.id, status: "QUEUED" } }),
      prisma.campaignSend.count({ where: { campaignId: campaign.id, status: { in: ["FAILED", "BOUNCED", "COMPLAINED"] } } })
    ]);

    const percent = total > 0 ? Math.round((sent / total) * 100) : 0;
    return res.json({
      campaignId: campaign.id,
      status: campaign.status,
      total,
      sent,
      delivered,
      queued,
      failed,
      percent
    });
  } catch (error) {
    console.error("[GET /api/campaigns/:id/progress]", error);
    return res.status(500).json({ message: "Failed to fetch progress" });
  }
});

campaignRouter.get("/:id/report", async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId }
    });
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });

    const [sends, events] = await Promise.all([
      prisma.campaignSend.findMany({
        where: { campaignId: campaign.id },
        include: { contact: true }
      }),
      prisma.emailEvent.findMany({
        where: { campaignId: campaign.id },
        orderBy: { occurredAt: "desc" }
      })
    ]);

    const sent = sends.length;
    const delivered = sends.filter((s) => s.status === "DELIVERED" || s.status === "SENT").length;
    const bounces = sends.filter((s) => s.status === "BOUNCED").length;
    const complaints = sends.filter((s) => s.status === "COMPLAINED").length;
    const unsubscribes = sends.filter((s) => s.status === "UNSUBSCRIBED").length;

    const openEvents = events.filter((e) => e.eventType === "OPENED");
    const clickEvents = events.filter((e) => e.eventType === "CLICKED");
    const uniqueOpens = new Set(openEvents.map((e) => e.contactId).filter(Boolean)).size;
    const uniqueClicks = new Set(clickEvents.map((e) => e.contactId).filter(Boolean)).size;

    const linkMap = new Map<string, number>();
    for (const event of clickEvents) {
      const metadata = event.metadata as Record<string, unknown>;
      const link = String(metadata.url ?? "");
      if (!link) continue;
      linkMap.set(link, (linkMap.get(link) ?? 0) + 1);
    }

    const device = { desktop: 0, mobile: 0, tablet: 0 };
    for (const event of events) {
      const ua = (event.userAgent ?? "").toLowerCase();
      if (ua.includes("mobile")) device.mobile += 1;
      else if (ua.includes("tablet") || ua.includes("ipad")) device.tablet += 1;
      else device.desktop += 1;
    }

    const buckets = new Map<string, { opens: number; clicks: number }>();
    const firstSentAt = sends.map((s) => s.sentAt).filter(Boolean).sort((a, b) => (a! < b! ? -1 : 1))[0];
    const start = firstSentAt ? new Date(firstSentAt) : null;
    const hourlyUntil = start ? new Date(start.getTime() + 48 * 60 * 60 * 1000) : null;
    for (const event of events) {
      if (event.eventType !== "OPENED" && event.eventType !== "CLICKED") continue;
      const useHourly = hourlyUntil ? event.occurredAt <= hourlyUntil : true;
      const key = useHourly
        ? event.occurredAt.toISOString().slice(0, 13) + ":00:00Z"
        : event.occurredAt.toISOString().slice(0, 10) + "T00:00:00Z";
      const current = buckets.get(key) ?? { opens: 0, clicks: 0 };
      if (event.eventType === "OPENED") current.opens += 1;
      if (event.eventType === "CLICKED") current.clicks += 1;
      buckets.set(key, current);
    }

    const timeSeries = Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([time, counts]) => ({ time, ...counts }));

    return res.json({
      campaignId: campaign.id,
      summary: {
        sent,
        delivered,
        uniqueOpens,
        totalOpens: openEvents.length,
        uniqueClicks,
        totalClicks: clickEvents.length,
        bounces,
        complaints,
        unsubscribes
      },
      links: Array.from(linkMap.entries()).map(([url, count]) => ({ url, count })),
      devices: device,
      timeSeries,
      perContact: sends.map((send) => ({
        contactId: send.contactId,
        email: send.contact.email,
        firstName: send.contact.firstName,
        lastName: send.contact.lastName,
        status: send.status,
        sentAt: send.sentAt
      }))
    });
  } catch (error) {
    console.error("[GET /api/campaigns/:id/report]", error);
    return res.status(500).json({ message: "Failed to fetch report" });
  }
});

campaignRouter.get("/:id/report.csv", async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: String(req.params.id), orgId: req.user!.orgId }
    });
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });

    const sends = await prisma.campaignSend.findMany({
      where: { campaignId: campaign.id },
      include: { contact: true }
    });

    const eventRows = await prisma.emailEvent.findMany({
      where: { campaignId: campaign.id }
    });

    const byContact = new Map<string, { opens: number; clicks: number; bounces: number; complaints: number; unsubscribes: number }>();
    for (const event of eventRows) {
      if (!event.contactId) continue;
      const row = byContact.get(event.contactId) ?? { opens: 0, clicks: 0, bounces: 0, complaints: 0, unsubscribes: 0 };
      if (event.eventType === "OPENED") row.opens += 1;
      if (event.eventType === "CLICKED") row.clicks += 1;
      if (event.eventType === "BOUNCED") row.bounces += 1;
      if (event.eventType === "COMPLAINED") row.complaints += 1;
      if (event.eventType === "UNSUBSCRIBED") row.unsubscribes += 1;
      byContact.set(event.contactId, row);
    }

    const headers = [
      "contact_id",
      "email",
      "first_name",
      "last_name",
      "send_status",
      "sent_at",
      "opens",
      "clicks",
      "bounces",
      "complaints",
      "unsubscribes"
    ];

    const escapeCsv = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;
    const lines = [headers.join(",")];
    for (const send of sends) {
      const stats = byContact.get(send.contactId) ?? { opens: 0, clicks: 0, bounces: 0, complaints: 0, unsubscribes: 0 };
      lines.push(
        [
          escapeCsv(send.contactId),
          escapeCsv(send.contact.email),
          escapeCsv(send.contact.firstName ?? ""),
          escapeCsv(send.contact.lastName ?? ""),
          escapeCsv(send.status),
          escapeCsv(send.sentAt ? send.sentAt.toISOString() : ""),
          stats.opens,
          stats.clicks,
          stats.bounces,
          stats.complaints,
          stats.unsubscribes
        ].join(",")
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="campaign-${campaign.id}-report.csv"`);
    return res.send(lines.join("\n"));
  } catch (error) {
    console.error("[GET /api/campaigns/:id/report.csv]", error);
    return res.status(500).json({ message: "Failed to export report CSV" });
  }
});
