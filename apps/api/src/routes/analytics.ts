import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

analyticsRouter.get("/dashboard", async (req, res) => {
  const orgId = req.user!.orgId;

  const [contacts, sentRows, recentActivity, allEvents, campaigns] = await Promise.all([
    prisma.contact.count({ where: { orgId } }),
    prisma.campaignSend.findMany({
      where: { campaign: { orgId }, status: { not: "QUEUED" } },
      select: { status: true, campaignId: true, contactId: true }
    }),
    prisma.emailEvent.findMany({
      where: { campaign: { orgId } },
      orderBy: { occurredAt: "desc" },
      take: 20
    }),
    prisma.emailEvent.findMany({
      where: { campaign: { orgId } }
    }),
    prisma.campaign.findMany({
      where: { orgId, status: "SENT" },
      orderBy: { updatedAt: "desc" }
    })
  ]);

  const totalSent = sentRows.length;
  const delivered = sentRows.filter((s) => s.status === "DELIVERED" || s.status === "SENT").length;
  const bounces = sentRows.filter((s) => s.status === "BOUNCED").length;
  const complaints = sentRows.filter((s) => s.status === "COMPLAINED").length;

  const uniqueOpens = new Set(allEvents.filter((e) => e.eventType === "OPENED").map((e) => e.contactId).filter(Boolean)).size;
  const uniqueClicks = new Set(allEvents.filter((e) => e.eventType === "CLICKED").map((e) => e.contactId).filter(Boolean)).size;
  const unsubscribes = allEvents.filter((e) => e.eventType === "UNSUBSCRIBED").length;

  const openRate = delivered > 0 ? (uniqueOpens / delivered) * 100 : 0;
  const clickRate = delivered > 0 ? (uniqueClicks / delivered) * 100 : 0;
  const bounceRate = totalSent > 0 ? (bounces / totalSent) * 100 : 0;
  const complaintRate = totalSent > 0 ? (complaints / totalSent) * 100 : 0;
  const unsubscribeRate = delivered > 0 ? (unsubscribes / delivered) * 100 : 0;

  const campaignMetrics = campaigns.map((campaign) => {
    const rows = sentRows.filter((s) => s.campaignId === campaign.id);
    const deliveredCount = rows.filter((s) => s.status === "DELIVERED" || s.status === "SENT").length;
    const contactIds = new Set(rows.map((r) => r.contactId));
    const uniqueOpenCount = new Set(
      allEvents
        .filter((e) => e.campaignId === campaign.id && e.eventType === "OPENED" && e.contactId && contactIds.has(e.contactId))
        .map((e) => e.contactId)
    ).size;
    const uniqueClickCount = new Set(
      allEvents
        .filter((e) => e.campaignId === campaign.id && e.eventType === "CLICKED" && e.contactId && contactIds.has(e.contactId))
        .map((e) => e.contactId)
    ).size;

    return {
      id: campaign.id,
      name: campaign.name,
      openRate: deliveredCount > 0 ? Number(((uniqueOpenCount / deliveredCount) * 100).toFixed(2)) : 0,
      clickRate: deliveredCount > 0 ? Number(((uniqueClickCount / deliveredCount) * 100).toFixed(2)) : 0,
      delivered: deliveredCount
    };
  });

  const topCampaigns = campaignMetrics
    .sort((a, b) => b.openRate - a.openRate)
    .slice(0, 5);

  return res.json({
    cards: {
      totalContacts: contacts,
      emailsSent: totalSent,
      avgOpenRate: Number(openRate.toFixed(2)),
      avgClickRate: Number(clickRate.toFixed(2)),
      bounceRate: Number(bounceRate.toFixed(2)),
      complaintRate: Number(complaintRate.toFixed(2)),
      unsubscribeRate: Number(unsubscribeRate.toFixed(2))
    },
    topCampaigns,
    recentActivity
  });
});
