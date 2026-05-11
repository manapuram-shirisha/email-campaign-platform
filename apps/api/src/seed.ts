import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const defaultFromEmail = process.env.SES_FROM_EMAIL || "verified@example.com";
const seedUserEmails = [
  "manapuramshiri17@gmail.com",
  "yasalapun@gmail.com",
  "nikhilyasalapu77@gmail.com"
];

const templateImages = {
  welcome: "https://dummyimage.com/1200x500/155eef/ffffff.png&text=Welcome+to+EmailOps",
  newsletter: "https://dummyimage.com/1200x500/0f766e/ffffff.png&text=Monthly+Newsletter",
  promotional: "https://dummyimage.com/1200x500/b45309/ffffff.png&text=Special+Offer",
  eventInvite: "https://dummyimage.com/1200x500/7c3aed/ffffff.png&text=Event+Invite",
  training: "https://dummyimage.com/1200x500/0f172a/ffffff.png&text=Training+Notice"
};

const starterTemplates = [
  {
    id: "seed-template-welcome",
    name: "Welcome",
    category: "Onboarding",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <img src="${templateImages.welcome}" alt="Team collaboration" width="552" style="width:100%;max-width:552px;height:auto;border-radius:8px;margin:0 0 18px;display:block;" />
        <h1 style="color:#172033;margin:0 0 12px;">Welcome {{first_name}}</h1>
        <p style="margin:0 0 12px;">Thanks for joining us. We're excited to have you.</p>
        <a href="https://example.com/start" style="display:inline-block;background:#1f5eff;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;">Get Started</a>
        <p style="font-size:12px;color:#687386;margin-top:28px;">{{unsubscribe_link}}</p>
      </div>
    `,
    blocks: [
      { type: "image", src: templateImages.welcome, alt: "Team collaboration", width: 100, href: "" },
      { type: "header", text: "Welcome {{first_name}}" },
      { type: "text", text: "Thanks for joining us. We're excited to have you." },
      { type: "button", label: "Get Started", url: "https://example.com/start" },
      { type: "footer", text: "{{unsubscribe_link}}" }
    ]
  },
  {
    id: "seed-template-newsletter",
    name: "Newsletter",
    category: "Newsletter",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <img src="${templateImages.newsletter}" alt="Workspace update" width="552" style="width:100%;max-width:552px;height:auto;border-radius:8px;margin:0 0 18px;display:block;" />
        <h1 style="color:#172033;margin:0 0 12px;">Monthly Newsletter</h1>
        <p style="margin:0 0 12px;">Hello {{first_name}}, here are this month's updates.</p>
        <hr style="border:none;border-top:1px solid #d8dee9;margin:14px 0;" />
        <p style="margin:0 0 12px;">Feature update, product news, and useful resources.</p>
        <p style="font-size:12px;color:#687386;margin-top:28px;">{{unsubscribe_link}}</p>
      </div>
    `,
    blocks: [
      { type: "image", src: templateImages.newsletter, alt: "Workspace update", width: 100, href: "" },
      { type: "header", text: "Monthly Newsletter" },
      { type: "text", text: "Hello {{first_name}}, here are this month's updates." },
      { type: "divider" },
      { type: "text", text: "Feature update, product news, and useful resources." },
      { type: "footer", text: "{{unsubscribe_link}}" }
    ]
  },
  {
    id: "seed-template-promotional",
    name: "Promotional",
    category: "Marketing",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <img src="${templateImages.promotional}" alt="Promotional offer" width="552" style="width:100%;max-width:552px;height:auto;border-radius:8px;margin:0 0 18px;display:block;" />
        <h1 style="color:#172033;margin:0 0 12px;">Special Offer</h1>
        <p style="margin:0 0 12px;">Hi {{first_name}}, this offer is available for a limited time.</p>
        <a href="https://example.com/offer" style="display:inline-block;background:#009b8f;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;">View Offer</a>
        <p style="font-size:12px;color:#687386;margin-top:28px;">{{unsubscribe_link}}</p>
      </div>
    `,
    blocks: [
      { type: "image", src: templateImages.promotional, alt: "Promotional offer", width: 100, href: "" },
      { type: "header", text: "Special Offer" },
      { type: "text", text: "Hi {{first_name}}, this offer is available for a limited time." },
      { type: "button", label: "View Offer", url: "https://example.com/offer" },
      { type: "footer", text: "{{unsubscribe_link}}" }
    ]
  },
  {
    id: "seed-template-event-invite",
    name: "Event Invite",
    category: "Events",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <img src="${templateImages.eventInvite}" alt="Event audience" width="552" style="width:100%;max-width:552px;height:auto;border-radius:8px;margin:0 0 18px;display:block;" />
        <h1 style="color:#172033;margin:0 0 12px;">You're Invited</h1>
        <p style="margin:0 0 12px;">Join us for our upcoming event.</p>
        <a href="https://example.com/event" style="display:inline-block;background:#d88700;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;">Register Now</a>
        <p style="font-size:12px;color:#687386;margin-top:28px;">{{unsubscribe_link}}</p>
      </div>
    `,
    blocks: [
      { type: "image", src: templateImages.eventInvite, alt: "Event audience", width: 100, href: "" },
      { type: "header", text: "You're Invited" },
      { type: "text", text: "Join us for our upcoming event." },
      { type: "button", label: "Register Now", url: "https://example.com/event" },
      { type: "footer", text: "{{unsubscribe_link}}" }
    ]
  },
  {
    id: "seed-template-training-notice",
    name: "Training Notice",
    category: "Training",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <img src="${templateImages.training}" alt="Online training" width="552" style="width:100%;max-width:552px;height:auto;border-radius:8px;margin:0 0 18px;display:block;" />
        <h1 style="color:#172033;margin:0 0 12px;">Training Session</h1>
        <p style="margin:0 0 8px;">Hello {{first_name}}, your training session details are below.</p>
        <p style="margin:0 0 12px;">Date: Coming soon</p>
        <p style="font-size:12px;color:#687386;margin-top:28px;">{{unsubscribe_link}}</p>
      </div>
    `,
    blocks: [
      { type: "image", src: templateImages.training, alt: "Online training", width: 100, href: "" },
      { type: "header", text: "Training Session" },
      { type: "text", text: "Hello {{first_name}}, your training session details are below." },
      { type: "text", text: "Date: Coming soon" },
      { type: "footer", text: "{{unsubscribe_link}}" }
    ]
  }
];

async function main() {
  const organisation = await prisma.organisation.upsert({
    where: { id: "seed-org" },
    update: {
      fromEmail: defaultFromEmail,
      sesConfigSet: process.env.SES_CONFIGURATION_SET || "email-platform-events",
      awsRegion: process.env.AWS_REGION || "ap-south-1"
    },
    create: {
      id: "seed-org",
      name: "Demo Organisation",
      fromEmail: defaultFromEmail,
      sesConfigSet: process.env.SES_CONFIGURATION_SET || "email-platform-events",
      awsRegion: process.env.AWS_REGION || "ap-south-1"
    }
  });

  const passwordHash = await bcrypt.hash("Admin@123", 10);

  await prisma.user.deleteMany({
    where: {
      email: {
        notIn: seedUserEmails
      }
    }
  });

  await prisma.user.upsert({
    where: { email: "manapuramshiri17@gmail.com" },
    update: {
      name: "Super Admin",
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      orgId: organisation.id
    },
    create: {
      email: "manapuramshiri17@gmail.com",
      name: "Super Admin",
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      orgId: organisation.id
    }
  });

  await prisma.user.upsert({
    where: { email: "yasalapun@gmail.com" },
    update: {
      passwordHash,
      name: "Campaign Admin",
      role: UserRole.CAMPAIGN_MANAGER,
      orgId: organisation.id
    },
    create: {
      email: "yasalapun@gmail.com",
      name: "Campaign Admin",
      passwordHash,
      role: UserRole.CAMPAIGN_MANAGER,
      orgId: organisation.id
    }
  });

  await prisma.user.upsert({
    where: { email: "nikhilyasalapu77@gmail.com" },
    update: {
      passwordHash,
      name: "Viewer",
      role: UserRole.VIEWER,
      orgId: organisation.id
    },
    create: {
      email: "nikhilyasalapu77@gmail.com",
      name: "Viewer",
      passwordHash,
      role: UserRole.VIEWER,
      orgId: organisation.id
    }
  });

  const list = await prisma.contactList.upsert({
    where: {
      orgId_name: {
        orgId: organisation.id,
        name: "Newsletter Subscribers"
      }
    },
    update: {},
    create: {
      orgId: organisation.id,
      name: "Newsletter Subscribers",
      description: "Seed list for demo contacts",
      tags: ["demo", "newsletter"]
    }
  });

  const realTestList = await prisma.contactList.upsert({
    where: {
      orgId_name: {
        orgId: organisation.id,
        name: "Real Test Recipients"
      }
    },
    update: {},
    create: {
      orgId: organisation.id,
      name: "Real Test Recipients",
      description: "Real mailbox recipients for SES testing",
      tags: ["real-test", "ses"]
    }
  });

  const contacts = [
    {
      email: "aisha@example.com",
      firstName: "Aisha",
      lastName: "Rao",
      customFields: { company: "Acme", city: "Chennai" }
    },
    {
      email: "rahul@example.com",
      firstName: "Rahul",
      lastName: "Mehta",
      customFields: { company: "Northstar", city: "Bengaluru" }
    },
    {
      email: "priya@example.com",
      firstName: "Priya",
      lastName: "Sharma",
      customFields: { company: "Bluepeak", city: "Mumbai" }
    },
    {
      email: "yasalapun@gmail.com",
      firstName: "Yasalapu",
      lastName: "N",
      customFields: { company: "Real Test", city: "Hyderabad" },
      realTest: true
    },
    {
      email: "nyasalapu@gmail.com",
      firstName: "N",
      lastName: "Yasalapu",
      customFields: { company: "Real Test", city: "Hyderabad" },
      realTest: true
    },
    {
      email: "nikhilyasalapu77@gmail.com",
      firstName: "Nikhil",
      lastName: "Yasalapu",
      customFields: { company: "Real Test", city: "Hyderabad" },
      realTest: true
    },
    {
      email: "manapuramshiri17@gmail.com",
      firstName: "Shiri",
      lastName: "Manapuram",
      customFields: { company: "Real Test", city: "Hyderabad" },
      realTest: true
    }
  ];

  for (const item of contacts) {
    const contact = await prisma.contact.upsert({
      where: {
        orgId_email: {
          orgId: organisation.id,
          email: item.email
        }
      },
      update: {
        firstName: item.firstName,
        lastName: item.lastName,
        status: "ACTIVE",
        customFields: item.customFields
      },
      create: {
        orgId: organisation.id,
        email: item.email,
        firstName: item.firstName,
        lastName: item.lastName,
        status: "ACTIVE",
        source: "MANUAL",
        customFields: item.customFields
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

    if ("realTest" in item) {
      await prisma.contactListMember.upsert({
        where: {
          contactId_listId: {
            contactId: contact.id,
            listId: realTestList.id
          }
        },
        update: {},
        create: {
          contactId: contact.id,
          listId: realTestList.id
        }
      });
    }
  }

  const createdTemplates = [];

  for (const tpl of starterTemplates) {
    const created = await prisma.template.upsert({
      where: { id: tpl.id },
      update: {
        name: tpl.name,
        category: tpl.category,
        html: tpl.html,
        blocks: tpl.blocks
      },
      create: {
        id: tpl.id,
        orgId: organisation.id,
        name: tpl.name,
        category: tpl.category,
        html: tpl.html,
        blocks: tpl.blocks
      }
    });

    createdTemplates.push(created);
  }

  await prisma.segment.upsert({
    where: { id: "seed-segment-chennai" },
    update: {},
    create: {
      id: "seed-segment-chennai",
      orgId: organisation.id,
      name: "City equals Chennai",
      rules: {
        operator: "AND",
        conditions: [
          {
            field: "custom.city",
            operator: "equals",
            value: "Chennai"
          }
        ]
      }
    }
  });

  await prisma.campaign.upsert({
    where: { id: "seed-campaign-draft" },
    update: {},
    create: {
      id: "seed-campaign-draft",
      orgId: organisation.id,
      name: "Demo Welcome Campaign",
      subject: "Welcome to Demo Organisation",
      previewText: "A quick welcome message for new subscribers",
      fromName: "Demo Marketing",
      fromEmail: defaultFromEmail,
      replyToEmail: defaultFromEmail,
      templateId: createdTemplates[0]?.id,
      status: "DRAFT",
      timezone: "Asia/Kolkata"
    }
  });

  console.log("Database seeded successfully.");
  console.log("Seeded users:");
  console.log("SUPER_ADMIN: manapuramshiri17@gmail.com / Admin@123");
  console.log("CAMPAIGN_MANAGER: yasalapun@gmail.com / Admin@123");
  console.log("VIEWER: nikhilyasalapu77@gmail.com / Admin@123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
