import { Router } from "express";
import { ContactSource, ContactStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizeEmail } from "../lib/contactValidation.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

export const contactsRouter = Router();

contactsRouter.use(requireAuth);

const writeAccess = requireRole("SUPER_ADMIN", "CAMPAIGN_MANAGER");

contactsRouter.post("/", writeAccess, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    listIds: z.array(z.string()).default([]),
    customFields: z.record(z.unknown()).default({})
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid contact payload",
      errors: parsed.error.flatten()
    });
  }

  const email = normalizeEmail(parsed.data.email);
  const customFields = parsed.data.customFields as Prisma.InputJsonObject;

  const contact = await prisma.contact.upsert({
    where: {
      orgId_email: {
        orgId: req.user!.orgId,
        email
      }
    },
    update: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone,
      customFields
    },
    create: {
      orgId: req.user!.orgId,
      email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone,
      customFields,
      source: ContactSource.MANUAL
    }
  });

  for (const listId of parsed.data.listIds) {
    const list = await prisma.contactList.findFirst({
      where: {
        id: String(listId),
        orgId: req.user!.orgId
      }
    });

    if (list) {
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
    }
  }

  return res.status(201).json({ contact });
});

contactsRouter.get("/:id", async (req, res) => {
  const contactId = String(req.params.id);

  const eventsPage = Math.max(Number(req.query.eventsPage ?? 1), 1);
  const eventsPageSize = Math.min(Math.max(Number(req.query.eventsPageSize ?? 50), 1), 100);
  const eventsSkip = (eventsPage - 1) * eventsPageSize;

  const contact = await prisma.contact.findFirst({
    where: {
      id: contactId,
      orgId: req.user!.orgId
    },
    include: {
      lists: {
        include: {
          list: true
        },
        orderBy: {
          subscribedAt: "desc"
        }
      }
    }
  });

  if (!contact) {
    return res.status(404).json({
      message: "Contact not found"
    });
  }

  const [events, eventsTotal] = await Promise.all([
    prisma.emailEvent.findMany({
      where: {
        contactId: contact.id
      },
      orderBy: {
        occurredAt: "desc"
      },
      skip: eventsSkip,
      take: eventsPageSize
    }),
    prisma.emailEvent.count({
      where: {
        contactId: contact.id
      }
    })
  ]);

  return res.json({
    contact: {
      id: contact.id,
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
      status: contact.status,
      source: contact.source,
      customFields: contact.customFields,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      lists: contact.lists.map((member) => ({
        id: member.list.id,
        name: member.list.name,
        subscribedAt: member.subscribedAt
      }))
    },
    events,
    eventsPage,
    eventsPageSize,
    eventsTotal
  });
});

contactsRouter.put("/:id", writeAccess, async (req, res) => {
  const contactId = String(req.params.id);

  const schema = z.object({
    email: z.string().email().optional(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    status: z.nativeEnum(ContactStatus).optional(),
    customFields: z.record(z.unknown()).optional()
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid contact payload",
      errors: parsed.error.flatten()
    });
  }

  const existingContact = await prisma.contact.findFirst({
    where: {
      id: contactId,
      orgId: req.user!.orgId
    }
  });

  if (!existingContact) {
    return res.status(404).json({
      message: "Contact not found"
    });
  }

  const contact = await prisma.contact.update({
    where: {
      id: existingContact.id
    },
    data: {
      ...parsed.data,
      email: parsed.data.email ? normalizeEmail(parsed.data.email) : undefined,
      customFields: parsed.data.customFields as Prisma.InputJsonObject | undefined
    }
  });

  return res.json({ contact });
});

contactsRouter.delete("/:id", writeAccess, async (req, res) => {
  const contactId = String(req.params.id);

  const existingContact = await prisma.contact.findFirst({
    where: {
      id: contactId,
      orgId: req.user!.orgId
    }
  });

  if (!existingContact) {
    return res.status(404).json({
      message: "Contact not found"
    });
  }

  await prisma.contact.delete({
    where: {
      id: existingContact.id
    }
  });

  return res.json({
    message: "Contact deleted"
  });
});
