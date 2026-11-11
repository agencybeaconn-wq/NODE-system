-- =============================================================================
-- Storage: buckets 'attachments' e 'briefing-files' isolados por dono.
--
-- Antes: policy FOR ALL para qualquer usuário logado + leitura pública pela API.
-- Um cliente podia listar, sobrescrever ou apagar arquivo de outro cliente.
--
-- Agora:
--   - qualquer usuário logado ENVIA arquivo (formulários do portal e da equipe);
--   - só o dono do arquivo (quem enviou) ou a equipe da agência lista, altera ou apaga;
--   - os links públicos continuam funcionando (bucket público serve a URL sem RLS),
--     mas ninguém mais lista o conteúdo do bucket pela API;
--   - limite de tamanho e tipo também no servidor (antes só no navegador).
-- =============================================================================

UPDATE storage.buckets
   SET file_size_limit = 10485760,  -- 10 MB, igual ao formulário de demanda
       allowed_mime_types = ARRAY['image/*', 'application/pdf']
 WHERE id = 'attachments';

UPDATE storage.buckets
   SET file_size_limit = 5242880,   -- 5 MB, igual ao formulário de briefing
       allowed_mime_types = ARRAY['image/*']
 WHERE id = 'briefing-files';

DROP POLICY IF EXISTS "attachments authenticated manage" ON storage.objects;
DROP POLICY IF EXISTS "attachments public read" ON storage.objects;
DROP POLICY IF EXISTS "briefing-files authenticated manage" ON storage.objects;
DROP POLICY IF EXISTS "briefing-files public read" ON storage.objects;

CREATE POLICY "anexos_upload_autenticado" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('attachments', 'briefing-files'));

CREATE POLICY "anexos_leitura_dono_ou_equipe" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id IN ('attachments', 'briefing-files')
           AND (owner_id = auth.uid()::text OR public.is_agency_staff()));

CREATE POLICY "anexos_alteracao_dono_ou_equipe" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id IN ('attachments', 'briefing-files')
           AND (owner_id = auth.uid()::text OR public.is_agency_staff()))
    WITH CHECK (bucket_id IN ('attachments', 'briefing-files'));

CREATE POLICY "anexos_exclusao_dono_ou_equipe" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id IN ('attachments', 'briefing-files')
           AND (owner_id = auth.uid()::text OR public.is_agency_staff()));
