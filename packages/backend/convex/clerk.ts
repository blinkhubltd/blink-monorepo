import { httpAction } from "./_generated/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";

// Define WebhookEvent type since we're not in a Next.js environment
type WebhookEvent = {
  type: string;
  data: Record<string, any>;
};

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

export const handleClerkWebhook = httpAction(async (ctx, request) => {
  if (!webhookSecret) {
    throw new Error('CLERK_WEBHOOK_SECRET environment variable is not set!');
  }

  const event = await validateRequest(request);
  if (!event) {
    return new Response('Invalid request', { status: 400 });
  }

  switch (event.type) {
    case 'user.created':
    case 'user.updated': {
      const { id, ...attributes } = event.data;
      await ctx.runMutation(internal.users.upsertUser, {
        clerkId: id,
        email: attributes.email_addresses[0]?.email_address,
        name: `${attributes.first_name} ${attributes.last_name}`,
        image: attributes.image_url,
      });
      break;
    }
    case 'user.deleted': {
      const { id } = event.data;
      if (id) {
        await ctx.runMutation(internal.users.deleteUser, { clerkId: id });
      }
      break;
    }
    default: {
      console.log('Unhandled Clerk webhook event:', event.type);
    }
  }

  return new Response(null, { status: 200 });
});

async function validateRequest(req: Request) {
  if (!webhookSecret) {
    throw new Error('CLERK_WEBHOOK_SECRET environment variable is not set!');
  }
  
  console.log('Received webhook request headers:', {
    'svix-id': req.headers.get('svix-id'),
    'svix-timestamp': req.headers.get('svix-timestamp'),
    'svix-signature': req.headers.get('svix-signature'),
    'content-type': req.headers.get('content-type'),
    'user-agent': req.headers.get('user-agent'),
  });
  
  const payload = await req.text();
  console.log('Webhook payload length:', payload.length);

  const svixHeaders = {
    'svix-id': req.headers.get('svix-id')!,
    'svix-timestamp': req.headers.get('svix-timestamp')!,
    'svix-signature': req.headers.get('svix-signature')!,
  };

  // Check if required headers are present
  if (!svixHeaders['svix-id'] || !svixHeaders['svix-timestamp'] || !svixHeaders['svix-signature']) {
    console.error('Missing required Svix headers:', svixHeaders);
    return null;
  }

  const wh = new Webhook(webhookSecret);
  try {
    return wh.verify(payload, svixHeaders) as WebhookEvent;
  } catch (error) {
    console.error('Webhook validation failed:', error);
    console.error('Headers used:', svixHeaders);
    return null;
  }
}
