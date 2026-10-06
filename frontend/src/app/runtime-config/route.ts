export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    chatbotUrl: process.env.CHATBOT_URL || process.env.NEXT_PUBLIC_CHATBOT_URL || '/chatbot',
    ssoEnabled: (process.env.CHATBOT_SSO_ENABLED || process.env.NEXT_PUBLIC_CHATBOT_SSO_ENABLED) === 'true',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
