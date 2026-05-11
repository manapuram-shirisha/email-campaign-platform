import { Router } from "express";
import { Prisma, ContactStatus } from "@prisma/client";
import { z } from "zod";
import { parseCsv } from "../lib/csv.js";
import { normalizeEmail } from "../lib/contactValidation.js";
import { getPagination } from "../lib/pagination.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

export const listsRouter = Router();

listsRouter.use(requireAuth);

const writeAccess = requireRole("SUPER_ADMIN", "CAMPAIGN_MANAGER");

listsRouter.get("/", async (req, res) => {
  const lists = await prisma.contactList.findMany({
    where: { orgId: req.user!.orgId },
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: "desc" }
  });

  return res.json({
    lists: lists.map((list) => ({
      id: list.id,
      name: list.name,
      description: list.description,
      tags: list.tags,
      contactCount: list._count.members,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt
    }))
  });
});

listsRouter.post("/", writeAccess, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string()).default([])
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid list payload",
      errors: parsed.error.flatten()
    });
  }

  const list = await prisma.contactList.create({
    data: {
      orgId: req.user!.orgId,
      name: parsed.data.name,
      description: parsed.data.description,
      tags: parsed.data.tags
    }
  });

  return res.status(201).json({ list });
});

listsRouter.get("/:id", async (req, res) => {
  const listId = String(req.params.id);

  const list = await prisma.contactList.findFirst({
    where: { id: listId, orgId: req.user!.orgId },
    include: { _count: { select: { members: true } } }
  });

  if (!list) {
    return res.status(404).json({ message: "List not found" });
  }

  const memberIds = await prisma.contactListMember.findMany({
    where: { listId: list.id },
    select: { contactId: true }
  });

  const contactIds = memberIds.map((m) => m.contactId);

  const [sendStats, eventStats] = contactIds.length
    ? await Promise.all([
        prisma.campaignSend.groupBy({
          by: ["status"],
          where: { contactId: { in: contactIds } },
          _count: { _all: true }
        }),
        prisma.emailEvent.groupBy({
          by: ["eventType"],
          where: { contactId: { in: contactIds } },
          _count: { _all: true }
        })
      ])
    : [[], []];

  const totalSent = sendStats.reduce((acc, row) => acc + row._count._all, 0);
  const bounced = sendStats.find((s) => s.status === "BOUNCED")?._count._all ?? 0;
  const delivered = (sendStats.find((s) => s.status === "DELIVERED")?._count._all ?? 0) +
    (sendStats.find((s) => s.status === "SENT")?._count._all ?? 0);
  const opens = eventStats.find((e) => e.eventType === "OPENED")?._count._all ?? 0;

  const bounceRate = totalSent > 0 ? Number(((bounced / totalSent) * 100).toFixed(2)) : 0;
  const openRate = delivered > 0 ? Number(((opens / delivered) * 100).toFixed(2)) : 0;

  return res.json({
    list: {
      id: list.id,
      name: list.name,
      description: list.description,
      tags: list.tags,
      contactCount: list._count.members,
      bounceRate,
      openRate,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt
    }
  });
});

listsRouter.put("/:id", writeAccess, async (req, res) => {
  const listId = String(req.params.id);

  const schema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    tags: z.array(z.string()).optional()
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid list payload",
      errors: parsed.error.flatten()
    });
  }

  const existingList = await prisma.contactList.findFirst({
    where: { id: listId, orgId: req.user!.orgId }
  });

  if (!existingList) {
    return res.status(404).json({ message: "List not found" });
  }

  const list = await prisma.contactList.update({
    where: { id: existingList.id },
    data: parsed.data
  });

  return res.json({ list });
});

listsRouter.delete("/:id", writeAccess, async (req, res) => {
  const listId = String(req.params.id);

  const existingList = await prisma.contactList.findFirst({
    where: { id: listId, orgId: req.user!.orgId }
  });

  if (!existingList) {
    return res.status(404).json({ message: "List not found" });
  }

  await prisma.contactList.delete({
    where: { id: existingList.id }
  });

  return res.json({ message: "List deleted" });
});

listsRouter.get("/:id/contacts", async (req, res) => {
  const listId = String(req.params.id);
  const pagination = getPagination(req.query);
  const search = String(req.query.search ?? "").trim();

  const sortByRaw = String(req.query.sortBy ?? "subscribedAt");
  const sortOrderRaw = String(req.query.sortOrder ?? "desc").toLowerCase();
  const sortOrder: Prisma.SortOrder = sortOrderRaw === "asc" ? "asc" : "desc";

  const list = await prisma.contactList.findFirst({
    where: { id: listId, orgId: req.user!.orgId }
  });

  if (!list) {
    return res.status(404).json({ message: "List not found" });
  }

  const where: Prisma.ContactListMemberWhereInput = {
    listId: list.id,
    contact: {
      orgId: req.user!.orgId,
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    }
  };

  const orderBy: Prisma.ContactListMemberOrderByWithRelationInput =
    sortByRaw === "email"
      ? { contact: { email: sortOrder } }
      : sortByRaw === "firstName"
      ? { contact: { firstName: sortOrder } }
      : { subscribedAt: sortOrder };

  const [members, total] = await Promise.all([
    prisma.contactListMember.findMany({
      where,
      skip: pagination.skip,
      take: pagination.take,
      include: { contact: true },
      orderBy
    }),
    prisma.contactListMember.count({ where })
  ]);

  return res.json({
    contacts: members.map((member) => ({
      ...member.contact,
      subscribedAt: member.subscribedAt
    })),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total
  });
});

listsRouter.post("/:id/contacts/bulk", writeAccess, async (req, res) => {
  const listId = String(req.params.id);

  const schema = z.discriminatedUnion("action", [
    z.object({
      action: z.literal("remove_from_list"),
      contactIds: z.array(z.string()).min(1)
    }),
    z.object({
      action: z.literal("update_status"),
      contactIds: z.array(z.string()).min(1),
      status: z.nativeEnum(ContactStatus)
    })
  ]);

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid bulk action payload",
      errors: parsed.error.flatten()
    });
  }

  const list = await prisma.contactList.findFirst({
    where: { id: listId, orgId: req.user!.orgId }
  });

  if (!list) {
    return res.status(404).json({ message: "List not found" });
  }

  const contactsInOrg = await prisma.contact.findMany({
    where: {
      id: { in: parsed.data.contactIds },
      orgId: req.user!.orgId
    },
    select: { id: true }
  });

  const allowedContactIds = contactsInOrg.map((c) => c.id);

  if (allowedContactIds.length === 0) {
    return res.status(400).json({ message: "No valid contacts found for this organisation" });
  }

  if (parsed.data.action === "remove_from_list") {
    const result = await prisma.contactListMember.deleteMany({
      where: {
        listId: list.id,
        contactId: { in: allowedContactIds }
      }
    });

    return res.json({
      message: "Contacts removed from list",
      affected: result.count
    });
  }

  const result = await prisma.contact.updateMany({
    where: {
      id: { in: allowedContactIds },
      orgId: req.user!.orgId
    },
    data: {
      status: parsed.data.status
    }
  });

  return res.json({
    message: "Contact status updated",
    affected: result.count
  });
});

listsRouter.post("/:id/import", writeAccess, async (req, res) => {
  const listId = String(req.params.id);

  const schema = z.object({
    mode: z.enum(["preview", "commit"]),
    csv: z.string().min(1),
    mapping: z
      .object({
        email: z.string().min(1),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional()
      })
      .optional()
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid import payload",
      errors: parsed.error.flatten()
    });
  }

  const list = await prisma.contactList.findFirst({
    where: { id: listId, orgId: req.user!.orgId }
  });

  if (!list) {
    return res.status(404).json({ message: "List not found" });
  }

  const { headers, rows } = parseCsv(parsed.data.csv);

  if (Buffer.byteLength(parsed.data.csv, "utf8") > 25 * 1024 * 1024) {
    return res.status(400).json({
      message: "CSV exceeds max size of 25 MB"
    });
  }

  if (parsed.data.mode === "preview") {
    return res.json({
      headers,
      previewRows: rows.slice(0, 10),
      totalRows: rows.length
    });
  }

  if (!parsed.data.mapping) {
    return res.status(400).json({
      message: "Mapping is required for commit mode"
    });
  }

  const job = await prisma.importJob.create({
    data: {
      listId: list.id,
      status: "RUNNING",
      totalRows: rows.length,
      added: 0,
      updated: 0,
      skipped: 0,
      errored: 0
    }
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;

  const emailKey = parsed.data.mapping.email;
  const firstNameKey = parsed.data.mapping.firstName;
  const lastNameKey = parsed.data.mapping.lastName;
  const phoneKey = parsed.data.mapping.phone;

  for (const row of rows) {
    try {
      const rawEmail = String(row[emailKey] ?? "").trim();

      if (!rawEmail) {
        errored += 1;
        continue;
      }

      const email = normalizeEmail(rawEmail);

      const suppressed = await prisma.suppressionList.findUnique({
        where: {
          orgId_email: {
            orgId: req.user!.orgId,
            email
          }
        }
      });

      if (suppressed) {
        skipped += 1;
        continue;
      }

      const existing = await prisma.contact.findUnique({
        where: {
          orgId_email: {
            orgId: req.user!.orgId,
            email
          }
        }
      });

      const contact = await prisma.contact.upsert({
        where: {
          orgId_email: {
            orgId: req.user!.orgId,
            email
          }
        },
        update: {
          firstName: firstNameKey ? String(row[firstNameKey] ?? "") || null : undefined,
          lastName: lastNameKey ? String(row[lastNameKey] ?? "") || null : undefined,
          phone: phoneKey ? String(row[phoneKey] ?? "") || null : undefined,
          source: "IMPORT"
        },
        create: {
          orgId: req.user!.orgId,
          email,
          firstName: firstNameKey ? String(row[firstNameKey] ?? "") || null : null,
          lastName: lastNameKey ? String(row[lastNameKey] ?? "") || null : null,
          phone: phoneKey ? String(row[phoneKey] ?? "") || null : null,
          source: "IMPORT"
        }
      });

      await prisma.contactListMember.upsert({
        where: {
          contactId_listId: {
            contactId: contact.id,
            listId: list.id
          }
        },
        update: {},
        create: {
          contactId: contact.id,
          listId: list.id
        }
      });

      if (existing) {
        updated += 1;
      } else {
        added += 1;
      }
    } catch {
      errored += 1;
    }
  }

  const finishedJob = await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: "COMPLETED",
      added,
      updated,
      skipped,
      errored
    }
  });

  return res.json({
    importJob: finishedJob
  });
});
