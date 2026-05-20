import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedChannels = new Set([
  "Website Form",
  "WhatsApp",
  "Instagram",
  "Facebook Lead",
  "Matrimonio.com",
]);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders }
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return Response.json(
      { error: "Payload non valido" },
      { status: 400, headers: corsHeaders }
    );
  }

  const fullName = String(payload.full_name || "").trim();
  const phone = String(payload.phone || "").trim();
  const email = payload.email ? String(payload.email).trim() : null;
  const sourceChannel = String(payload.source_channel || "").trim();
  const eventDate = payload.event_date ? String(payload.event_date) : null;
  const eventType = payload.event_type ? String(payload.event_type).trim() : null;
  const message = String(payload.message || "").trim();

  if (!fullName || !phone || !message) {
    return Response.json(
      { error: "Nome, telefono e messaggio sono obbligatori" },
      { status: 400, headers: corsHeaders }
    );
  }

  const leadSource = allowedChannels.has(sourceChannel) ? sourceChannel : "Website Form";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: "Configurazione Supabase mancante" },
      { status: 500, headers: corsHeaders }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const insertLead = await supabase
    .from("leads")
    .insert({
      full_name: fullName,
      phone,
      email,
      source_channel: leadSource,
      event_date: eventDate,
      event_type: eventType,
      priority: "medium",
      status: "new",
    })
    .select("id")
    .single();

  if (insertLead.error) {
    return Response.json(
      { error: insertLead.error.message },
      { status: 400, headers: corsHeaders }
    );
  }

  const insertMessage = await supabase.from("lead_messages").insert({
    lead_id: insertLead.data.id,
    direction: "incoming",
    body: message,
  });

  if (insertMessage.error) {
    return Response.json(
      { error: insertMessage.error.message },
      { status: 400, headers: corsHeaders }
    );
  }

  return Response.json(
    { success: true, lead_id: insertLead.data.id },
    { status: 201, headers: corsHeaders }
  );
});

