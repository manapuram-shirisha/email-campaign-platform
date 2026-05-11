import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

export const segmentsRouter = Router();

segmentsRouter.use(requireAuth);

const writeAccess = requireRole("SUPER_ADMIN", "CAMPAIGN_MANAGER");

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(["equals", "not_equals", "contains", "not_contains", "opened_last_30_days", "never_opened", "never_clicked"]),
  value: z.union([z.string(), z.number(), z.boolean()])
    .optional()
});

const rulesSchema = z.object({
  operator: z.enum(["AND", "OR"]).default("AND"),
  conditions: z.array(conditionSchema).min(1)
});

function matchesCondition(
  contact: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    customFields: unknown;
  },
  condition: z.infer<typeof conditionSchema>
): boolean {
  let fieldValue: unknown = null;

  if (condition.field === "email") fieldValue = contact.email;
  else if (condition.field === "firstName") fieldValue = contact.firstName;
  else if (condition.field === "lastName") fieldValue = contact.lastName;
  else if (condition.field === "status") fieldValue = contact.status;
  else if (condition.field.startsWith("custom.")) {
    const key = condition.field.replace("custom.", "");
    const custom = (contact.customFields ?? {}) as Record<string, unknown>;
    fieldValue = custom[key];
  }

  const left = String(fieldValue ?? "").toLowerCase();
  const right = String(condition.value).toLowerCase();

  switch (condition.operator) {
    case "equals":
      return left === right;
    case "not_equals":
      return left !== right;
    case "contains":
      return left.includes(right);
    case "not_contains":
      return !left.includes(right);
    default:
      return false;
  }
}

async function getSegmentCount(orgId: string, rules: z.infer<typeof rulesSchema>) {
  const contacts = await prisma.contact.findMany({
    where: { orgId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      customFields: true
    }
  });

  const recentThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [openedContactIds, clickedContactIds] = await Promise.all([
    prisma.emailEvent.findMany({
      where: { contact: { orgId }, eventType: "OPENED", occurredAt: { gte: recentThreshold } },
      select: { contactId: true },
      distinct: ["contactId"]
    }),
    prisma.emailEvent.findMany({
      where: { contact: { orgId }, eventType: "CLICKED" },
      select: { contactId: true },
      distinct: ["contactId"]
    })
  ]);

  const openedSet = new Set(openedContactIds.map((x) => x.contactId).filter(Boolean));
  const clickedSet = new Set(clickedContactIds.map((x) => x.contactId).filter(Boolean));

  const matched = contacts.filter((contact) => {
    const results = rules.conditions.map((c) => {
      if (c.operator === "opened_last_30_days") return openedSet.has(contact.id);
      if (c.operator === "never_opened") return !openedSet.has(contact.id);
      if (c.operator === "never_clicked") return !clickedSet.has(contact.id);
      return matchesCondition(contact, c);
    });
    return rules.operator === "AND" ? results.every(Boolean) : results.some(Boolean);
  });

  return matched.length;
}

segmentsRouter.get("/", async (req, res) => {
  const segments = await prisma.segment.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { createdAt: "desc" }
  });

  return res.json({ segments });
});

segmentsRouter.post("/", writeAccess, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    rules: rulesSchema
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid segment payload",
      errors: parsed.error.flatten()
    });
  }

  const segment = await prisma.segment.create({
    data: {
      orgId: req.user!.orgId,
      name: parsed.data.name,
      rules: parsed.data.rules
    }
  });

  const count = await getSegmentCount(req.user!.orgId, parsed.data.rules);

  return res.status(201).json({
    segment,
    count
  });
});

segmentsRouter.get("/:id/count", async (req, res) => {
  const segment = await prisma.segment.findFirst({
    where: {
      id: String(req.params.id),
      orgId: req.user!.orgId
    }
  });

  if (!segment) {
    return res.status(404).json({ message: "Segment not found" });
  }

  const rulesParsed = rulesSchema.safeParse(segment.rules);

  if (!rulesParsed.success) {
    return res.status(400).json({ message: "Segment rules are invalid" });
  }

  const count = await getSegmentCount(req.user!.orgId, rulesParsed.data);

  return res.json({
    segmentId: segment.id,
    count
  });
});
