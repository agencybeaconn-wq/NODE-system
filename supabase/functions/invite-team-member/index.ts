// @ts-nocheck
import { instrument } from "../_shared/logger.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Schema de validação do payload de convite. Bloqueia role inválido (privilege escalation),
// email malformado, e UUIDs corrompidos. Zod = fonte de verdade (regra global CLAUDE.md).
const inviteSchema = z.object({
    email: z.string().email("Email inválido"),
    name: z.string().min(1).max(200).optional(),
    phone: z.string().max(30).optional().nullable(),
    workspace_id: z.string().uuid("workspace_id deve ser UUID"),
    // "client" e o papel do portal do cliente (baixo privilegio) e e o valor mais comum
    // no banco. Faltava no allowlist, o que fazia o convite de cliente falhar com 400.
    role: z.enum(["client", "operator", "admin", "manager", "owner"]).default("operator"),
    agency_roles: z.array(z.string().uuid()).optional(),
    access_levels: z.array(z.unknown()).optional(),
    linked_client_id: z.string().uuid().optional().nullable(),
    user_type: z.enum(["agency", "client"]).default("agency"),
    site_url: z.string().url().optional().nullable(),
});

const getInviteEmailHtml = (inviteLink: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light only">
    <style>
        body, h1, h2, h3, p, a, span, div { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important; }
        body { background-color: #f4f4f5; color: #18181b; margin: 0; padding: 0; }
        .wrapper { background-color: #f4f4f5; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .header { background: #09090b; padding: 32px; text-align: center; }
        .content { padding: 40px; text-align: center; }
        .title { font-size: 24px; font-weight: 700; margin-bottom: 16px; color: #09090b; letter-spacing: -0.02em; }
        .text { font-size: 16px; line-height: 1.6; color: #52525b; margin-bottom: 32px; font-weight: 400; }
        .btn { display: inline-block; background-color: #18181b; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px; }
        .footer { padding: 24px; text-align: center; font-size: 12px; color: #a1a1aa; background-color: #fafafa; border-top: 1px solid #f4f4f5; font-weight: 500; }
        .link-text { color: #a1a1aa; font-size: 11px; word-break: break-all; margin-top: 20px; font-weight: 400; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <span style="font-size: 26px; font-weight: 900; letter-spacing: -0.02em; color: #ffffff;">NODE</span>
            </div>
            <div class="content">
                <h1 class="title">Você foi convidado!</h1>
                <p class="text">
                    Olá! Você foi convidado para colaborar na plataforma <strong>NODE</strong>.
                    Estamos ansiosos para ter você no time.
                </p>
                <a href="${inviteLink}" class="btn">Aceitar Convite</a>
                <p class="link-text">
                    Se o botão não funcionar, copie este link:<br>
                    ${inviteLink}
                </p>
            </div>
            <div class="footer">
                &copy; 2026 NODE. Tecnologia que vende.
            </div>
        </div>
    </div>
</body>
</html>
`;

// Versão texto puro do e-mail. Enviar html + text reduz o spam score (mensagens só-HTML
// pontuam pior nos filtros) e cobre clientes que não renderizam HTML.
const getInviteEmailText = (inviteLink: string) => `Você foi convidado para colaborar no NODE.

Para aceitar o convite e criar sua senha, acesse:
${inviteLink}

Se você não esperava este convite, pode ignorar este e-mail com segurança.

— NODE`;

serve(instrument("invite-team-member", async (req) => {
    // 1. CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        console.log(">>> [LOG] Invite function version 2.0 starting...");

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            console.error(">>> [CRITICAL ERROR] Missing Supabase environment variables");
            throw new Error("Configuração do servidor incompleta (Env Vars)");
        }

        // --- AUTH: Validate the requesting user ---
        const authHeader = req.headers.get("authorization");
        const token = authHeader?.replace('Bearer ', '');
        if (!token) {
            console.warn(">>> [AUTH] Missing authorization header");
            return new Response(JSON.stringify({ error: 'Sessão não encontrada. Faça login novamente.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401,
            });
        }

        // Valida o JWT do usuário usando ANON_KEY como apikey (service_role não funciona para getUser)
        const supabaseAuth = createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );
        const { data: { user: callerUser }, error: authError } = await supabaseAuth.auth.getUser(token);
        if (authError || !callerUser) {
            console.warn(">>> [AUTH] Token validation failed:", authError?.message);
            return new Response(JSON.stringify({
                error: 'Sessão expirada. Faça login novamente para enviar convites.',
                detail: authError?.message,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401,
            });
        }
        console.log(">>> [AUTH] Authenticated user:", callerUser.id);

        let rawBody;
        try {
            rawBody = await req.json();
            console.log(">>> [LOG] Request body keys:", Object.keys(rawBody));
        } catch (e) {
            console.error(">>> [ERROR] Failed to parse request body:", e);
            throw new Error("Invalid JSON body");
        }

        // Valida payload com Zod — bloqueia role/UUID/email inválidos no servidor (regra global CLAUDE.md).
        const parsed = inviteSchema.safeParse(rawBody);
        if (!parsed.success) {
            console.error(">>> [VALIDATION] Payload inválido:", parsed.error.flatten());
            return new Response(JSON.stringify({
                error: "Payload inválido",
                details: parsed.error.flatten(),
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            });
        }
        const { email, name, phone, workspace_id, role, agency_roles, access_levels, linked_client_id, user_type, site_url } = parsed.data;
        const normalizedEmail = email.toLowerCase().trim();

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // --- AUTH: Verify caller owns or belongs to the workspace ---
        const { data: ws } = await supabaseAdmin
            .from('workspaces')
            .select('owner_id')
            .eq('id', workspace_id)
            .single();

        if (ws?.owner_id !== callerUser.id) {
            const { data: callerMember } = await supabaseAdmin
                .from('team_members')
                .select('id')
                .eq('workspace_id', workspace_id)
                .eq('user_id', callerUser.id)
                .single();

            if (!callerMember) {
                return new Response(JSON.stringify({ error: 'You do not have permission to invite members to this workspace' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403,
                });
            }
        }

        const PRODUCTION_URL = 'https://www.agencynode.online';
        let siteUrl = Deno.env.get('VITE_APP_URL') || PRODUCTION_URL;
        if (site_url && !site_url.includes('localhost') && !site_url.includes('127.0.0.1')) {
            siteUrl = site_url;
        }

        // --- STEP 1 & 2: PREPARE USER & MAGIC LINK ---
        console.log(`>>> [LOG] Step 1: Trying to generate link directly (checks if user exists)...`);
        let targetId;
        let linkData;

        const { data: magicLinkData, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: normalizedEmail,
            options: { redirectTo: `${siteUrl}/auth/accept-invite` }
        });

        if (!magicError && magicLinkData?.user) {
            console.log(">>> [LOG] User exists! Link generated directly.");
            linkData = magicLinkData;
            targetId = magicLinkData.user.id;
        } else {
            console.log(">>> [LOG] User might not exist or link failed. Trying to create user record...");
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email: normalizedEmail,
                email_confirm: true,
                user_metadata: { workspace_id, full_name: name || "" }
            });

            if (createError) {
                console.error(">>> [ERROR] Failed to create user:", createError);
                throw new Error(`Auth Error: ${createError.message}`);
            }
            targetId = newUser.user.id;

            console.log(`>>> [LOG] Step 2: Generating Link for new user...`);
            const { data: newLinkData, error: newMagicError } = await supabaseAdmin.auth.admin.generateLink({
                type: 'magiclink',
                email: normalizedEmail,
                options: { redirectTo: `${siteUrl}/auth/accept-invite` }
            });

            if (newMagicError) {
                console.error(">>> [ERROR] Failed to generate link for new user:", newMagicError);
                throw new Error(`Auth Error (Link): ${newMagicError.message}`);
            }
            linkData = newLinkData;
        }

        // --- STEP 3: DATABASE RECORD ---
        console.log(`>>> [LOG] Step 3: Settling team_members record...`);
        const { data: teamMember } = await supabaseAdmin
            .from('team_members')
            .select('id')
            .eq('workspace_id', workspace_id)
            .ilike('email', normalizedEmail)
            .maybeSingle();

        const memberData = {
            workspace_id,
            email: normalizedEmail,
            role: role || 'operator',
            status: 'invited',
            invited_at: new Date().toISOString(),
            linked_client_id: linked_client_id || null,
            user_type: user_type || 'agency',
            user_id: targetId,
            name: name || null,
            phone: phone || null
        };

        let memberId;
        if (teamMember) {
            const { data: updated, error: uErr } = await supabaseAdmin
                .from('team_members')
                .update(memberData)
                .eq('id', teamMember.id)
                .select('id')
                .single();
            if (uErr) {
                console.error(">>> [ERROR] DB Update failed:", uErr);
                throw new Error(`Erro ao atualizar membro: ${uErr.message}`);
            }
            memberId = updated.id;
        } else {
            const { data: inserted, error: iErr } = await supabaseAdmin
                .from('team_members')
                .insert(memberData)
                .select('id')
                .single();
            if (iErr) {
                console.error(">>> [ERROR] DB Insert failed:", iErr);
                throw new Error(`Erro ao inserir membro: ${iErr.message}. Verifique se a coluna 'name' existe.`);
            }
            memberId = inserted.id;
        }

        // --- STEP 4: PERMISSIONS ---
        if (agency_roles?.length > 0) {
            await supabaseAdmin.from('member_roles').delete().eq('member_id', memberId);
            await supabaseAdmin.from('member_roles').insert(agency_roles.map(r => ({ member_id: memberId, role_id: r })));
        }

        // --- STEP 5: EMAIL ---
        if (!RESEND_API_KEY) {
            console.error(">>> [ERROR] RESEND_API_KEY is null");
            throw new Error("API Key do Resend não configurada no Supabase");
        }

        // Link autossuficiente: aponta DIRETO pra produção carregando o token_hash (fluxo verifyOtp).
        // Independe da Site URL do GoTrue (que estava redirecionando o convite pra localhost) e
        // mantém o domínio do link IGUAL ao do remetente (@agencynode.online) — reduz spam.
        const tokenHash = linkData?.properties?.hashed_token;
        const verificationType = linkData?.properties?.verification_type || 'magiclink';
        if (!tokenHash) {
            console.error(">>> [ERROR] hashed_token ausente na resposta do generateLink");
            throw new Error("Falha ao gerar o token do convite (hashed_token ausente)");
        }
        const inviteLink = `${siteUrl}/auth/accept-invite?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`;
        const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'NODE <contato@agencynode.online>';
        // reply_to em mailbox monitorada faz o e-mail parecer correspondência real (não robô),
        // o que reduz a chance de cair no spam. Sobrescrevível por env.
        const REPLY_TO = Deno.env.get('RESEND_REPLY_TO') || 'contato@agencynode.online';

        const resEmail = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: [normalizedEmail],
                reply_to: REPLY_TO,
                subject: 'Você foi convidado para o NODE',
                html: getInviteEmailHtml(inviteLink),
                text: getInviteEmailText(inviteLink)
            })
        });

        if (!resEmail.ok) {
            const resData = await resEmail.json();
            console.error(">>> [ERROR] Resend API failure:", resData);
            throw new Error(`Erro ao enviar email (Resend): ${resData.message || resEmail.statusText}`);
        }

        return new Response(JSON.stringify({ success: true, member_id: memberId }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error(">>> [FATAL] Invite process failed:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
}));
