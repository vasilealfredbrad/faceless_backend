import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion,
});

const PRICE_TO_TIER: Record<string, string> = {};

function initPriceMap() {
  if (process.env.STRIPE_STARTER_PRICE_ID)
    PRICE_TO_TIER[process.env.STRIPE_STARTER_PRICE_ID] = "starter";
  if (process.env.STRIPE_GROWTH_PRICE_ID)
    PRICE_TO_TIER[process.env.STRIPE_GROWTH_PRICE_ID] = "growth";
  if (process.env.STRIPE_CREATOR_PRICE_ID)
    PRICE_TO_TIER[process.env.STRIPE_CREATOR_PRICE_ID] = "creator";
}

const PLAN_PRICES: Record<string, string | undefined> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  growth: process.env.STRIPE_GROWTH_PRICE_ID,
  creator: process.env.STRIPE_CREATOR_PRICE_ID,
};

async function authenticateUser(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { id: user.id, email: user.email || "" };
}

export const stripeRoute = Router();

stripeRoute.post("/stripe/checkout", async (req: Request, res: Response) => {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const { plan } = req.body;
    if (!plan || !["starter", "growth", "creator"].includes(plan)) {
      res.status(400).json({ error: "Invalid plan" });
      return;
    }

    initPriceMap();
    const priceId = PLAN_PRICES[plan];
    if (!priceId) {
      res.status(400).json({ error: "Plan not configured yet. Price IDs missing." });
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const origin = req.headers.origin || req.headers.referer || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      metadata: { supabase_user_id: user.id, plan },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

stripeRoute.post("/stripe/portal", async (req: Request, res: Response) => {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      res.status(400).json({ error: "No subscription found" });
      return;
    }

    const origin = req.headers.origin || req.headers.referer || "http://localhost:5173";

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/dashboard`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe portal error:", err);
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

stripeRoute.post("/stripe/webhook", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    res.status(400).json({ error: "Missing signature or webhook secret" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  try {
    initPriceMap();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const plan = session.metadata?.plan;
        if (userId && plan) {
          await supabase
            .from("profiles")
            .update({
              tier: plan,
              stripe_subscription_id: session.subscription as string,
              stripe_customer_id: session.customer as string,
            })
            .eq("id", userId);
          console.log(`[stripe] User ${userId} upgraded to ${plan}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price?.id;
        const tier = priceId ? PRICE_TO_TIER[priceId] : undefined;

        if (tier) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id")
            .eq("stripe_subscription_id", sub.id);

          if (profiles && profiles.length > 0) {
            await supabase
              .from("profiles")
              .update({ tier })
              .eq("id", profiles[0].id);
            console.log(`[stripe] Subscription ${sub.id} updated to ${tier}`);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", sub.id);

        if (profiles && profiles.length > 0) {
          await supabase
            .from("profiles")
            .update({
              tier: "free",
              stripe_subscription_id: null,
            })
            .eq("id", profiles[0].id);
          console.log(`[stripe] Subscription ${sub.id} cancelled, user downgraded to free`);
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).json({ error: "Webhook handler failed" });
  }
});
