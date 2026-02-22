import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const projectId = Deno.env.get("BLINK_PROJECT_ID");
    const secretKey = Deno.env.get("BLINK_SECRET_KEY");

    if (!projectId || !secretKey) {
      return new Response(
        JSON.stringify({ error: "Missing config" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const blink = createClient({ projectId, secretKey });

    // Verify auth
    const auth = await blink.auth.verifyToken(req.headers.get("Authorization"));
    if (!auth.valid) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { records, allergies, profile, language } = body;

    if (!records || records.length === 0) {
      return new Response(JSON.stringify({ error: "No records provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recSummary = records.slice(0, 20).map((r: any) =>
      `- [${r.recordType}] ${r.title}${r.diagnosis ? ` | Diagnosis: ${r.diagnosis}` : ""}${r.medications ? ` | Meds: ${r.medications}` : ""}${r.visitDate ? ` | Date: ${r.visitDate}` : ""}${r.isCritical ? " [CRITICAL]" : ""}`
    ).join("\n");

    const allergySummary = allergies?.length > 0
      ? `Allergies: ${allergies.map((a: any) => `${a.allergen}(${a.severity})`).join(", ")}`
      : "No known allergies";

    const langNote = language === "ta" ? " Please include a Tamil translation after each section." :
                     language === "ml" ? " Please include a Malayalam translation after each section." : "";

    const prompt = `You are a compassionate medical AI assistant helping migrants maintain their health records. Generate a comprehensive, easy-to-understand health summary.${langNote}

Patient Info:
- Name: ${profile?.fullName || "Unknown"}
- Blood Type: ${profile?.bloodType || "Unknown"}
- DOB: ${profile?.dateOfBirth || "Unknown"}
- ${allergySummary}

Medical Records (${records.length} total):
${recSummary}

Generate a structured health summary with these sections using ## headers:
## Health Overview
## Critical Alerts
## Current Medications Summary
## Missing Records & Gaps
## Preventive Care Recommendations
## Health Insights

Be concise, use bullet points, highlight critical items. Note any missing important records like annual checkups, vaccinations, or screenings. Use clear, accessible language suitable for patients.`;

    const result = await blink.ai.generateText({
      prompt,
      model: "gpt-4.1-mini",
    });

    return new Response(JSON.stringify({ summary: result.text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("AI Summary Error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate summary" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

Deno.serve(handler);
